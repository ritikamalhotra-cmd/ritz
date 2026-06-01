// ATS Phase 1 — Requisition routes
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createRequisition,
  listRequisitions,
  getRequisition,
  updateRequisition,
  submitRequisition,
  actOnRequisitionStep,
  getRequisitionApprovalQueue,
} from '../services/requisition.service';

const router = Router();
router.use(authenticate);

// ── List / Create ─────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { status, department } = req.query as Record<string, string>;
    const list = await listRequisitions({
      status,
      department,
      role: req.user!.role,
      userId: req.user!.id,
    });
    res.json(list);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const req_ = await createRequisition({ ...req.body, createdById: req.user!.id });
    res.status(201).json(req_);
  } catch (e) { next(e); }
});

// ── Approval queue ────────────────────────────────────────────────────────────

router.get('/approval-queue', async (req, res, next) => {
  try {
    const queue = await getRequisitionApprovalQueue(req.user!.id, req.user!.role);
    res.json(queue);
  } catch (e) { next(e); }
});

// ── Single requisition ────────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const item = await getRequisition(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const item = await updateRequisition(req.params.id, req.body);
    res.json(item);
  } catch (e) { next(e); }
});

// ── Submit for approval ───────────────────────────────────────────────────────

router.post('/:id/submit', async (req, res, next) => {
  try {
    const item = await submitRequisition(req.params.id, req.user!.id);
    res.json(item);
  } catch (e) { next(e); }
});

// ── Approve / Reject / Send-back ──────────────────────────────────────────────

router.post('/:id/approve', async (req, res, next) => {
  try {
    const { comment } = req.body as { comment?: string };
    const item = await actOnRequisitionStep({
      reqId: req.params.id,
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'APPROVE',
      comment,
    });
    res.json(item);
  } catch (e) { next(e); }
});

router.post('/:id/reject', async (req, res, next) => {
  try {
    const { comment } = req.body as { comment?: string };
    const item = await actOnRequisitionStep({
      reqId: req.params.id,
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'REJECT',
      comment,
    });
    res.json(item);
  } catch (e) { next(e); }
});

router.post('/:id/send-back', async (req, res, next) => {
  try {
    const { comment } = req.body as { comment?: string };
    const item = await actOnRequisitionStep({
      reqId: req.params.id,
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'SEND_BACK',
      comment,
    });
    res.json(item);
  } catch (e) { next(e); }
});

export default router;
