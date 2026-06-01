// Requisition service — ATS Phase 1
// Approval chain: HM → HOD → HR_HEAD (always)
//   + CEO added when grade is L6+ or budgetedCTCMax > 5_000_000

import { db } from '../utils/db';

// ─── Approval chain builder ───────────────────────────────────────────────────

const SENIOR_GRADES = new Set(['L6', 'L7', 'L8', 'L9', 'L10', 'VP', 'SVP', 'EVP', 'C-Suite']);
const HIGH_BUDGET = 5_000_000; // 50 LPA

export function buildApprovalChain(grade?: string | null, budgetMax?: number | null): string[] {
  // Keys must match RequisitionStatus enum: PENDING_{KEY}_APPROVAL
  const chain = ['HM', 'HOD', 'HR_HEAD'];
  if ((grade && SENIOR_GRADES.has(grade)) || (budgetMax && budgetMax >= HIGH_BUDGET)) {
    chain.push('CEO');
  }
  return chain;
}

// Map approverRole string to User.role enum value for finding the right approver
const ROLE_MAP: Record<string, string> = {
  HM:       'HIRING_MANAGER',
  HOD:      'HOD',
  HR_HEAD:  'HR_HEAD',
  CEO:      'SUPER_ADMIN',
};

// ─── Create requisition ───────────────────────────────────────────────────────

export async function createRequisition(data: {
  title: string;
  department: string;
  subDepartment?: string;
  grade?: string;
  level?: string;
  location?: string;
  workMode?: string;
  employmentType?: string;
  headcount?: number;
  isReplacement?: boolean;
  replacementFor?: string;
  hiringReason?: string;
  budgetedCTCMin?: number;
  budgetedCTCMax?: number;
  jdText?: string;
  responsibilities?: string;
  requirements?: string;
  priority?: string;
  targetClosureDate?: string;
  hiringManagerId?: string;
  hodId?: string;
  recruiterId?: string;
  createdById: string;
}) {
  const count = await db.requisition.count();
  const reqNumber = count + 1;

  const req = await db.requisition.create({
    data: {
      reqNumber,
      title: data.title,
      department: data.department,
      subDepartment: data.subDepartment,
      grade: data.grade,
      level: data.level,
      location: data.location,
      workMode: (data.workMode as any) ?? 'ONSITE',
      employmentType: (data.employmentType as any) ?? 'PERMANENT',
      headcount: data.headcount ?? 1,
      isReplacement: data.isReplacement ?? false,
      replacementFor: data.replacementFor,
      hiringReason: data.hiringReason,
      budgetedCTCMin: data.budgetedCTCMin,
      budgetedCTCMax: data.budgetedCTCMax,
      jdText: data.jdText,
      responsibilities: data.responsibilities,
      requirements: data.requirements,
      priority: (data.priority as any) ?? 'MEDIUM',
      targetClosureDate: data.targetClosureDate ? new Date(data.targetClosureDate) : undefined,
      hiringManagerId: data.hiringManagerId,
      hodId: data.hodId,
      recruiterId: data.recruiterId,
      createdById: data.createdById,
      status: 'DRAFT',
    },
    include: { createdBy: { select: { id: true, firstName: true, lastName: true, role: true } } },
  });

  return req;
}

// ─── Submit for approval ──────────────────────────────────────────────────────

export async function submitRequisition(reqId: string, actorId: string) {
  const req = await db.requisition.findUnique({ where: { id: reqId } });
  if (!req) throw new Error('Requisition not found');
  if (req.status !== 'DRAFT' && req.status !== ('SENT_BACK' as any)) {
    throw new Error(`Cannot submit a requisition with status ${req.status}`);
  }

  const chain = buildApprovalChain(req.grade, req.budgetedCTCMax);

  // Delete any old steps and recreate
  await db.requisitionApprovalStep.deleteMany({ where: { requisitionId: reqId } });

  // Create approval steps, try to pre-assign approver by matching role
  const stepData = await Promise.all(
    chain.map(async (role, idx) => {
      const dbRole = ROLE_MAP[role] ?? role;
      const approver = await db.user.findFirst({
        where: { role: dbRole as any, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      return {
        requisitionId: reqId,
        stepOrder: idx + 1,
        approverRole: role,
        approverId: approver?.id ?? null,
        status: idx === 0 ? 'PENDING' : 'PENDING',
      };
    })
  );

  await db.requisitionApprovalStep.createMany({ data: stepData as any });

  const firstStatus = `PENDING_${chain[0]}_APPROVAL` as any;
  const updated = await db.requisition.update({
    where: { id: reqId },
    data: { status: firstStatus },
    include: reqInclude,
  });

  return updated;
}

// ─── Approve / Reject / Send-back a step ─────────────────────────────────────

export async function actOnRequisitionStep(opts: {
  reqId: string;
  actorId: string;
  actorRole: string;
  action: 'APPROVE' | 'REJECT' | 'SEND_BACK';
  comment?: string;
}) {
  const { reqId, actorId, actorRole, action, comment } = opts;

  const req = await db.requisition.findUnique({
    where: { id: reqId },
    include: { approvalSteps: { orderBy: { stepOrder: 'asc' } } },
  });
  if (!req) throw new Error('Requisition not found');

  // Find current active step
  const activeStep = req.approvalSteps.find(s => s.status === 'PENDING');
  if (!activeStep) throw new Error('No pending approval step');

  const isSuperUser = ['ADMIN', 'SUPER_ADMIN'].includes(actorRole);
  if (activeStep.approverRole !== actorRole && !isSuperUser) {
    throw new Error(`This step requires role ${activeStep.approverRole}`);
  }

  const now = new Date();

  await db.requisitionApprovalStep.update({
    where: { id: activeStep.id },
    data: {
      status: action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'SENT_BACK',
      action,
      comment,
      approverId: actorId,
      actedAt: now,
    },
  });

  if (action === 'REJECT') {
    await db.requisition.update({ where: { id: reqId }, data: { status: 'CANCELLED' } });
    return db.requisition.findUnique({ where: { id: reqId }, include: reqInclude });
  }

  if (action === 'SEND_BACK') {
    await db.requisition.update({ where: { id: reqId }, data: { status: 'DRAFT' } });
    return db.requisition.findUnique({ where: { id: reqId }, include: reqInclude });
  }

  // APPROVE — check if there's a next step
  const nextStep = req.approvalSteps.find(s => s.stepOrder === activeStep.stepOrder + 1);

  if (nextStep) {
    // Move to next step
    const nextStatus = `PENDING_${nextStep.approverRole}_APPROVAL` as any;
    await db.requisition.update({ where: { id: reqId }, data: { status: nextStatus } });
  } else {
    // All steps approved
    await db.requisition.update({
      where: { id: reqId },
      data: { status: 'APPROVED', approvedAt: now, openedAt: now },
    });
  }

  return db.requisition.findUnique({ where: { id: reqId }, include: reqInclude });
}

// ─── List requisitions ────────────────────────────────────────────────────────

export async function listRequisitions(filters: {
  status?: string;
  department?: string;
  hiringManagerId?: string;
  recruiterId?: string;
  createdById?: string;
  role?: string;
  userId?: string;
}) {
  const { status, department, hiringManagerId, recruiterId, role, userId } = filters;

  const where: any = {};
  if (status) where.status = status;
  if (department) where.department = department;

  // Role-based scoping
  if (role === 'HIRING_MANAGER') {
    where.hiringManagerId = userId;
  } else if (role === 'RECRUITER') {
    where.recruiterId = userId;
  } else if (role === 'HOD') {
    where.hodId = userId;
  }

  if (hiringManagerId) where.hiringManagerId = hiringManagerId;
  if (recruiterId) where.recruiterId = recruiterId;

  return db.requisition.findMany({
    where,
    include: reqInclude,
    orderBy: { createdAt: 'desc' },
  });
}

// ─── Get single requisition ───────────────────────────────────────────────────

export async function getRequisition(id: string) {
  return db.requisition.findUnique({ where: { id }, include: reqFullInclude });
}

// ─── Update requisition (DRAFT only) ─────────────────────────────────────────

export async function updateRequisition(id: string, data: Partial<Parameters<typeof createRequisition>[0]>) {
  const req = await db.requisition.findUnique({ where: { id } });
  if (!req) throw new Error('Not found');
  if (req.status !== 'DRAFT') throw new Error('Can only edit DRAFT requisitions');

  return db.requisition.update({
    where: { id },
    data: {
      ...data,
      workMode: data.workMode as any,
      employmentType: data.employmentType as any,
      priority: data.priority as any,
      targetClosureDate: data.targetClosureDate ? new Date(data.targetClosureDate) : undefined,
    },
    include: reqInclude,
  });
}

// ─── Get requisition approval queue for a user ────────────────────────────────

export async function getRequisitionApprovalQueue(userId: string, userRole: string) {
  const isSuperUser = ['ADMIN', 'SUPER_ADMIN'].includes(userRole);

  // Map user role to approverRole string
  const REVERSE_ROLE_MAP: Record<string, string> = {
    HIRING_MANAGER: 'HM',
    HOD:            'HOD',
    HR_HEAD:        'HR_HEAD',
    SUPER_ADMIN:    'CEO',
    ADMIN:          'CEO',
  };
  const approverRole = REVERSE_ROLE_MAP[userRole];

  const steps = await db.requisitionApprovalStep.findMany({
    where: {
      status: 'PENDING',
      ...(isSuperUser ? {} : { approverRole }),
    },
    include: {
      requisition: {
        include: reqInclude,
      },
      approver: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return steps;
}

// ─── Shared includes ──────────────────────────────────────────────────────────

const reqInclude = {
  createdBy:    { select: { id: true, firstName: true, lastName: true, role: true } },
  hiringManager:{ select: { id: true, firstName: true, lastName: true, role: true } },
  hod:          { select: { id: true, firstName: true, lastName: true, role: true } },
  recruiter:    { select: { id: true, firstName: true, lastName: true, role: true } },
  approvalSteps:{ orderBy: { stepOrder: 'asc' as const } },
} as const;

const reqFullInclude = {
  ...reqInclude,
  applications: {
    include: {
      candidate: { select: { id: true, fullName: true, email: true, phone: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
      recruiterScreen: true,
      hmReview: true,
      interviewPlan: { include: { rounds: { include: { feedback: true } } } },
    },
  },
} as const;
