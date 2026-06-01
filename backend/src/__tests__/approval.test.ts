import { handleApprovalAction } from '../services/approval.service';
import { db } from '../utils/db';

// Helpers to create test data
async function createTestUsers() {
  const ta = await db.user.create({
    data: { email: 'ta@test.dotpe.in', firstName: 'TA', lastName: 'Mgr', role: 'TA_MANAGER', passwordHash: 'x' },
  });
  const hod = await db.user.create({
    data: { email: 'hod@test.dotpe.in', firstName: 'HOD', lastName: 'User', role: 'HOD', passwordHash: 'x' },
  });
  const hrHead = await db.user.create({
    data: { email: 'hrhead@test.dotpe.in', firstName: 'HR', lastName: 'Head', role: 'HR_HEAD', passwordHash: 'x' },
  });
  const recruiter = await db.user.create({
    data: { email: 'rec@test.dotpe.in', firstName: 'Rec', lastName: 'User', role: 'RECRUITER', passwordHash: 'x' },
  });
  return { ta, hod, hrHead, recruiter };
}

async function createTestWorkflow(recruiterId: string) {
  const candidate = await db.candidate.create({
    data: { fullName: 'Test Candidate', email: `c${Date.now()}@example.com` },
  });
  const offer = await db.offerCase.create({
    data: {
      candidateId: candidate.id,
      createdById: recruiterId,
      recruiterId,
      roleTitle: 'SDE',
      department: 'Engineering',
      status: 'PENDING_TA_APPROVAL',
    },
  });
  const workflow = await db.approvalWorkflow.create({
    data: {
      offerCaseId: offer.id,
      status: 'IN_PROGRESS',
      currentStep: 0,
      steps: {
        create: [
          { stepOrder: 0, approverRole: 'TA_MANAGER', status: 'PENDING', slaDeadline: new Date(Date.now() + 48 * 3600000) },
          { stepOrder: 1, approverRole: 'HOD', status: 'PENDING', slaDeadline: new Date(Date.now() + 96 * 3600000) },
          { stepOrder: 2, approverRole: 'HR_HEAD', status: 'PENDING', slaDeadline: new Date(Date.now() + 144 * 3600000) },
        ],
      },
    },
    include: { steps: true },
  });
  return { offer, workflow };
}

beforeAll(async () => {
  await db.offerStatusHistory.deleteMany();
  await db.approvalStep.deleteMany();
  await db.approvalWorkflow.deleteMany();
  await db.offerCase.deleteMany();
  await db.candidate.deleteMany();
  await db.user.deleteMany({ where: { email: { endsWith: '@test.dotpe.in' } } });
});

afterAll(async () => {
  await db.offerStatusHistory.deleteMany();
  await db.approvalStep.deleteMany();
  await db.approvalWorkflow.deleteMany();
  await db.offerCase.deleteMany();
  await db.candidate.deleteMany();
  await db.user.deleteMany({ where: { email: { endsWith: '@test.dotpe.in' } } });
  await db.$disconnect();
});

describe('Approval workflow', () => {
  it('TA_MANAGER can approve step 0, advances to step 1', async () => {
    const { ta, recruiter } = await createTestUsers();
    const { workflow } = await createTestWorkflow(recruiter.id);

    await handleApprovalAction(workflow.id, ta.id, 'TA_MANAGER', { action: 'APPROVE' });

    const updated = await db.approvalWorkflow.findUnique({ where: { id: workflow.id } });
    expect(updated!.currentStep).toBe(1);
    expect(updated!.status).toBe('IN_PROGRESS');
  });

  it('wrong role cannot approve', async () => {
    const { hod, recruiter } = await createTestUsers();
    const { workflow } = await createTestWorkflow(recruiter.id);

    await expect(
      handleApprovalAction(workflow.id, hod.id, 'HOD', { action: 'APPROVE' }),
    ).rejects.toThrow('requires role');
  });

  it('full approve chain → offer status becomes APPROVED', async () => {
    const { ta, hod, hrHead, recruiter } = await createTestUsers();
    const { workflow, offer } = await createTestWorkflow(recruiter.id);

    await handleApprovalAction(workflow.id, ta.id, 'TA_MANAGER', { action: 'APPROVE' });
    await handleApprovalAction(workflow.id, hod.id, 'HOD', { action: 'APPROVE' });
    await handleApprovalAction(workflow.id, hrHead.id, 'HR_HEAD', { action: 'APPROVE' });

    const updatedOffer = await db.offerCase.findUnique({ where: { id: offer.id } });
    const updatedWorkflow = await db.approvalWorkflow.findUnique({ where: { id: workflow.id } });
    expect(updatedOffer!.status).toBe('APPROVED');
    expect(updatedWorkflow!.status).toBe('APPROVED');
  });

  it('HOD send-back resets chain to step 0 (TA_MANAGER)', async () => {
    const { ta, hod, recruiter } = await createTestUsers();
    const { workflow, offer } = await createTestWorkflow(recruiter.id);

    // Advance to HOD step
    await handleApprovalAction(workflow.id, ta.id, 'TA_MANAGER', { action: 'APPROVE' });
    // HOD sends back
    await handleApprovalAction(workflow.id, hod.id, 'HOD', { action: 'SEND_BACK', comment: 'Fix comp' });

    const updatedWorkflow = await db.approvalWorkflow.findUnique({ where: { id: workflow.id } });
    const updatedOffer = await db.offerCase.findUnique({ where: { id: offer.id } });
    expect(updatedWorkflow!.currentStep).toBe(0);
    expect(updatedOffer!.status).toBe('SENT_BACK_BY_HOD');
  });

  it('REJECT sets offer to REJECTED', async () => {
    const { ta, recruiter } = await createTestUsers();
    const { workflow, offer } = await createTestWorkflow(recruiter.id);

    await handleApprovalAction(workflow.id, ta.id, 'TA_MANAGER', { action: 'REJECT', comment: 'Not a fit' });

    const updatedOffer = await db.offerCase.findUnique({ where: { id: offer.id } });
    expect(updatedOffer!.status).toBe('REJECTED');
  });
});
