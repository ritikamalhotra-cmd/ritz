import { Router, Request, Response } from 'express';
import { db } from '../utils/db';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { attachDataScope } from '../middleware/dataScope';
import { validate } from '../middleware/validate';
import {
  createOfferSchema,
  updateOfferStatusSchema,
  offerListQuerySchema,
} from '../validators/offer.validators';
import { VALID_TRANSITIONS } from '../constants/statuses';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate, attachDataScope);

// POST /api/offers
router.post(
  '/',
  authorize('RECRUITER', 'TA_MANAGER', 'ADMIN', 'SUPER_ADMIN'),
  validate(createOfferSchema),
  async (req: Request, res: Response) => {
    try {
      const data = req.body;

      // Upsert candidate
      const candidate = await db.candidate.upsert({
        where: { email: data.candidate.email },
        update: {
          fullName: data.candidate.fullName,
          phone: data.candidate.phone,
          location: data.candidate.location,
          linkedIn: data.candidate.linkedIn,
          portfolio: data.candidate.portfolio,
        },
        create: data.candidate,
      });

      const count = await db.offerCase.count();
      const offerCase = await db.offerCase.create({
        data: {
          caseNumber: count + 1,
          candidateId: candidate.id,
          createdById: req.user!.id,
          recruiterId: data.recruiterId || req.user!.id,
          hiringManagerId: data.hiringManagerId,
          hodId: data.hodId,
          roleTitle: data.roleTitle,
          department: data.department,
          jobFamily: data.jobFamily,
          level: data.level,
          grade: data.grade,
          employmentType: data.employmentType,
          location: data.location,
          workMode: data.workMode,
          pfOptIn: data.pfOptIn,
          currentFixed: data.currentFixed,
          currentVariable: data.currentVariable,
          currentTotalCTC: data.currentTotalCTC,
          expectedFixed: data.expectedFixed,
          expectedTotal: data.expectedTotal,
          minimumAcceptable: data.minimumAcceptable,
          preferredDOJ: data.preferredDOJ ? new Date(data.preferredDOJ) : undefined,
          earliestDOJ: data.earliestDOJ ? new Date(data.earliestDOJ) : undefined,
          noticePeriodDays: data.noticePeriodDays,
          noticePeriodBuyout: data.noticePeriodBuyout,
          hasOfferInHand: data.hasOfferInHand,
          offerInHandCompany: data.offerInHandCompany,
          offerInHandAmount: data.offerInHandAmount,
          whyLikelyToJoin: data.whyLikelyToJoin,
          whyMayNotJoin: data.whyMayNotJoin,
          recruiterConfidence: data.recruiterConfidence,
          convictionScore: data.convictionScore,
          compensationProposal: {
            create: {
              ...data.compensation,
            },
          },
        },
        include: { candidate: true, compensationProposal: true },
      });

      await db.offerStatusHistory.create({
        data: {
          offerCaseId: offerCase.id,
          toStatus: 'DRAFT',
          changedById: req.user!.id,
        },
      });

      res.status(201).json({ offer: offerCase });
    } catch (err) {
      logger.error('Create offer error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// GET /api/offers
router.get('/', validate(offerListQuerySchema, 'query'), async (req: Request, res: Response) => {
  try {
    const { page, limit, status, department, search } = req.query as Record<string, string>;
    const p = parseInt(page) || 1;
    const l = parseInt(limit) || 20;

    const where: Record<string, unknown> = { ...(req.dataScope || {}) };
    if (status) where.status = status;
    if (department) where.department = department;
    if (search) {
      where.OR = [
        { roleTitle: { contains: search } },
        { candidate: { fullName: { contains: search } } },
        { candidate: { email: { contains: search } } },
      ];
    }

    const [total, offers] = await Promise.all([
      db.offerCase.count({ where }),
      db.offerCase.findMany({
        where,
        include: {
          candidate: { select: { id: true, fullName: true, email: true } },
          compensationProposal: { select: { proposedFixed: true, proposedTotalCTC: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * l,
        take: l,
      }),
    ]);

    res.json({ offers, pagination: { total, page: p, limit: l, pages: Math.ceil(total / l) } });
  } catch (err) {
    logger.error('List offers error', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/offers/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const offer = await db.offerCase.findFirst({
      where: { id: req.params.id, ...(req.dataScope ?? {}) } as any,
      include: {
        candidate: true,
        compensationProposal: true,
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        recruiter: { select: { id: true, firstName: true, lastName: true } },
        hiringManager: { select: { id: true, firstName: true, lastName: true } },
        workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
        offerLetter: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!offer) { res.status(404).json({ error: 'Offer not found' }); return; }

    // Parse interview summary if present
    const enriched = {
      ...offer,
      interviewSummary: offer.interviewSummaryJson
        ? (() => { try { return JSON.parse(offer.interviewSummaryJson); } catch { return null; } })()
        : null,
    };
    res.json({ offer: enriched });
  } catch (err) {
    logger.error('Get offer error', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/offers/:id/draft — save draft edits
router.patch('/:id/draft', async (req: Request, res: Response) => {
  try {
    const offer = await db.offerCase.findFirst({
      where: { id: req.params.id, ...(req.dataScope ?? {}) } as any,
    });
    if (!offer) { res.status(404).json({ error: 'Offer not found' }); return; }
    if (!['DRAFT', 'SENT_BACK_BY_TA', 'SENT_BACK_BY_HOD', 'SENT_BACK_BY_HR_HEAD'].includes(offer.status)) {
      res.status(422).json({ error: 'Only draft offers can be edited' }); return;
    }

    const {
      roleTitle, department, jobFamily, level, grade, location,
      noticePeriodDays, preferredDOJ, pfOptIn,
      proposedFixed, proposedVariable, joiningBonus, currentTotalCTC,
      salaryBreakup,
    } = req.body;

    await db.offerCase.update({
      where: { id: offer.id },
      data: {
        roleTitle: roleTitle || offer.roleTitle,
        department: department || offer.department,
        jobFamily, level, grade, location,
        noticePeriodDays: noticePeriodDays ? parseInt(noticePeriodDays) : undefined,
        preferredDOJ: preferredDOJ ? new Date(preferredDOJ) : undefined,
        pfOptIn: pfOptIn !== undefined ? pfOptIn : offer.pfOptIn,
        currentTotalCTC: currentTotalCTC ? parseFloat(currentTotalCTC) : undefined,
      },
    });

    if (proposedFixed) {
      const fixed = parseFloat(proposedFixed);
      const variable = parseFloat(proposedVariable) || 0;
      const bonus = parseFloat(joiningBonus) || 0;
      const salaryJson = salaryBreakup ? JSON.stringify(salaryBreakup) : undefined;

      await db.compensationProposal.upsert({
        where: { offerCaseId: offer.id },
        update: {
          proposedFixed: fixed,
          proposedVariable: variable,
          proposedTotalCash: fixed + variable,
          proposedTotalCTC: fixed + variable,
          joiningBonus: bonus,
          ...(salaryJson ? { otherComponents: salaryJson } : {}),
        },
        create: {
          offerCaseId: offer.id,
          proposedFixed: fixed,
          proposedVariable: variable,
          proposedTotalCash: fixed + variable,
          proposedTotalCTC: fixed + variable,
          joiningBonus: bonus,
          ...(salaryJson ? { otherComponents: salaryJson } : {}),
        },
      });
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error('Save draft error', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/offers/:id/status
router.patch(
  '/:id/status',
  authorize('RECRUITER', 'TA_MANAGER', 'ADMIN', 'SUPER_ADMIN'),
  validate(updateOfferStatusSchema),
  async (req: Request, res: Response) => {
    try {
      const { status, reason } = req.body;
      const offer = await db.offerCase.findFirst({
        where: { id: req.params.id, ...(req.dataScope ?? {}) } as any,
      });
      if (!offer) { res.status(404).json({ error: 'Offer not found' }); return; }

      const allowed = VALID_TRANSITIONS[offer.status] || [];
      if (!allowed.includes(status)) {
        res.status(422).json({ error: `Cannot transition from ${offer.status} to ${status}` });
        return;
      }

      const updated = await db.offerCase.update({
        where: { id: offer.id },
        data: { status },
      });

      await db.offerStatusHistory.create({
        data: {
          offerCaseId: offer.id,
          fromStatus: offer.status,
          toStatus: status,
          changedById: req.user!.id,
          reason,
        },
      });

      res.json({ offer: updated });
    } catch (err) {
      logger.error('Update offer status error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
