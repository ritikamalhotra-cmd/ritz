import { db, withTx } from '../utils/db';
import { logger } from '../utils/logger';

interface ChainStep {
  role: string;
  userId?: string;
  slaHours: number;
}

export async function createApprovalWorkflow(offerCaseId: string): Promise<void> {
  const offer = await db.offerCase.findUnique({
    where: { id: offerCaseId },
    include: { compensationProposal: true },
  });
  if (!offer) throw new Error(`Offer ${offerCaseId} not found`);

  // Pick matching rule — currently a single universal rule for Dotpe
  const rule = await db.approvalRule.findFirst({
    where: { isActive: true },
    orderBy: { priority: 'asc' },
  });
  if (!rule) throw new Error('No active approval rule found');

  const chain: ChainStep[] = JSON.parse(rule.approvalChain);

  await withTx(async (tx) => {
    const workflow = await tx.approvalWorkflow.create({
      data: { offerCaseId, status: 'IN_PROGRESS', currentStep: 0 },
    });

    for (const [i, step] of chain.entries()) {
      await tx.approvalStep.create({
        data: {
          workflowId: workflow.id,
          stepOrder: i,
          approverRole: step.role as never,
          approverId: step.userId ?? null,
          slaDeadline: new Date(Date.now() + step.slaHours * 3_600_000),
          status: 'PENDING',
        },
      });
    }
  });
}

export async function handleApprovalAction(
  workflowId: string,
  actorId: string,
  actorRole: string,
  opts: { action: 'APPROVE' | 'REJECT' | 'SEND_BACK' | 'DELEGATE'; comment?: string; delegatedToId?: string },
): Promise<void> {
  await withTx(async (tx) => {
    const workflow = await tx.approvalWorkflow.findUnique({
      where: { id: workflowId },
      include: { steps: { orderBy: { stepOrder: 'asc' } }, offerCase: true },
    });
    if (!workflow) throw new Error('Workflow not found');
    if (workflow.status !== 'IN_PROGRESS') throw new Error('Workflow is not in progress');

    const step = workflow.steps[workflow.currentStep];
    if (!step) throw new Error('No active step');

    const expectedRole = step.approverRole as string;
    const isDelegateTarget = step.delegatedToId === actorId;
    const isSuperUser = ['ADMIN', 'SUPER_ADMIN'].includes(actorRole);
    if (expectedRole !== actorRole && !isDelegateTarget && !isSuperUser) {
      throw new Error(`Step requires role ${expectedRole}, got ${actorRole}`);
    }

    const now = new Date();

    switch (opts.action) {
      case 'APPROVE': {
        await tx.approvalStep.update({
          where: { id: step.id },
          data: { status: 'APPROVED', action: 'APPROVE', comment: opts.comment, actedAt: now },
        });
        const isLast = workflow.currentStep + 1 === workflow.steps.length;
        if (isLast) {
          await tx.approvalWorkflow.update({ where: { id: workflowId }, data: { status: 'APPROVED', completedAt: now } });
          await tx.offerCase.update({ where: { id: workflow.offerCaseId }, data: { status: 'APPROVED' } });
          await tx.offerStatusHistory.create({
            data: { offerCaseId: workflow.offerCaseId, fromStatus: workflow.offerCase.status, toStatus: 'APPROVED', changedById: actorId },
          });
        } else {
          await tx.approvalWorkflow.update({ where: { id: workflowId }, data: { currentStep: workflow.currentStep + 1 } });
        }
        break;
      }

      case 'REJECT': {
        await tx.approvalStep.update({
          where: { id: step.id },
          data: { status: 'REJECTED', action: 'REJECT', comment: opts.comment, actedAt: now },
        });
        await tx.approvalWorkflow.update({ where: { id: workflowId }, data: { status: 'REJECTED', completedAt: now } });
        await tx.offerCase.update({ where: { id: workflow.offerCaseId }, data: { status: 'REJECTED' } });
        await tx.offerStatusHistory.create({
          data: { offerCaseId: workflow.offerCaseId, fromStatus: workflow.offerCase.status, toStatus: 'REJECTED', changedById: actorId },
        });
        break;
      }

      case 'SEND_BACK': {
        // Mark current step as sent back
        await tx.approvalStep.update({
          where: { id: step.id },
          data: { status: 'SENT_BACK', action: 'SEND_BACK', comment: opts.comment, actedAt: now },
        });
        // Reset ALL prior steps to PENDING so the chain restarts from step 0 (TA_MANAGER)
        for (const s of workflow.steps) {
          if (s.stepOrder < step.stepOrder) {
            await tx.approvalStep.update({ where: { id: s.id }, data: { status: 'PENDING', actedAt: null, action: null } });
          }
        }
        await tx.approvalWorkflow.update({ where: { id: workflowId }, data: { currentStep: 0, status: 'IN_PROGRESS' } });

        // Determine sent-back status on the offer
        const sentBackStatus = actorRole === 'TA_MANAGER'
          ? 'SENT_BACK_BY_TA'
          : actorRole === 'HOD'
          ? 'SENT_BACK_BY_HOD'
          : 'SENT_BACK_BY_HR_HEAD';

        await tx.offerCase.update({ where: { id: workflow.offerCaseId }, data: { status: sentBackStatus } });
        await tx.offerStatusHistory.create({
          data: { offerCaseId: workflow.offerCaseId, fromStatus: workflow.offerCase.status, toStatus: sentBackStatus as never, changedById: actorId },
        });
        break;
      }

      case 'DELEGATE': {
        if (!opts.delegatedToId) throw new Error('delegatedToId required for DELEGATE');
        await tx.approvalStep.update({
          where: { id: step.id },
          data: { delegatedToId: opts.delegatedToId, action: 'DELEGATE', comment: opts.comment },
        });
        break;
      }
    }
  });
}
