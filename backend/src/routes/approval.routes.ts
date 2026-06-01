import { Router, Request, Response } from 'express';
import { db } from '../utils/db';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import { createApprovalWorkflow, handleApprovalAction } from '../services/approval.service';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);

const approvalActionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'SEND_BACK', 'DELEGATE']),
  comment: z.string().optional(),
  delegatedToId: z.string().optional(),
});

// POST /api/approvals/submit/:offerCaseId — recruiter submits offer for approval
router.post(
  '/submit/:offerCaseId',
  authorize('RECRUITER', 'TA_MANAGER', 'ADMIN', 'SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const offer = await db.offerCase.findUnique({ where: { id: req.params.offerCaseId } });
      if (!offer) { res.status(404).json({ error: 'Offer not found' }); return; }
      if (offer.status !== 'DRAFT' && !offer.status.startsWith('SENT_BACK')) {
        res.status(422).json({ error: 'Offer cannot be submitted in current status' }); return;
      }

      // Create or recreate workflow
      const existing = await db.approvalWorkflow.findUnique({ where: { offerCaseId: offer.id } });
      if (existing) {
        // Delete and recreate if re-submitting after send-back
        await db.approvalStep.deleteMany({ where: { workflowId: existing.id } });
        await db.approvalWorkflow.delete({ where: { id: existing.id } });
      }

      await createApprovalWorkflow(offer.id);
      await db.offerCase.update({ where: { id: offer.id }, data: { status: 'PENDING_TA_APPROVAL' } });
      await db.offerStatusHistory.create({
        data: { offerCaseId: offer.id, fromStatus: offer.status, toStatus: 'PENDING_TA_APPROVAL', changedById: req.user!.id },
      });

      res.json({ ok: true });
    } catch (err) {
      logger.error('Submit for approval error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// GET /api/approvals/queue — current user's pending approval steps
router.get(
  '/queue',
  authorize('TA_MANAGER', 'HOD', 'HR_HEAD', 'ADMIN', 'SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const isSuperUser = ['ADMIN', 'SUPER_ADMIN'].includes(req.user!.role);
      const allSteps = await db.approvalStep.findMany({
        where: {
          ...(isSuperUser ? {} : { approverRole: req.user!.role as never }),
          status: 'PENDING',
          workflow: { status: 'IN_PROGRESS' },
        },
        include: {
          workflow: {
            include: {
              steps: { select: { id: true, stepOrder: true, approverRole: true, status: true } },
              offerCase: {
                include: {
                  candidate: { select: { fullName: true, email: true, phone: true } },
                  compensationProposal: true,
                  recruiter:      { select: { firstName: true, lastName: true } },
                  hiringManager:  { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
        orderBy: { slaDeadline: 'asc' },
      });
      // Only show the step that is actually up next (stepOrder === workflow.currentStep)
      const steps = allSteps.filter(s => s.stepOrder === s.workflow.currentStep).map(s => ({
        ...s,
        workflow: {
          ...s.workflow,
          offerCase: {
            ...s.workflow.offerCase,
            interviewSummary: s.workflow.offerCase.interviewSummaryJson
              ? (() => { try { return JSON.parse(s.workflow.offerCase.interviewSummaryJson); } catch { return null; } })()
              : null,
          },
        },
      }));
      res.json({ steps });
    } catch (err) {
      logger.error('Approval queue error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/approvals/workflows/:id/action
router.post(
  '/workflows/:id/action',
  authorize('TA_MANAGER', 'HOD', 'HR_HEAD', 'ADMIN', 'SUPER_ADMIN'),
  validate(approvalActionSchema),
  async (req: Request, res: Response) => {
    try {
      await handleApprovalAction(req.params.id, req.user!.id, req.user!.role, req.body);
      res.json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      if (message.includes('requires role') || message.includes('not in progress')) {
        res.status(422).json({ error: message });
      } else {
        logger.error('Approval action error', { err });
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  },
);

export default router;
