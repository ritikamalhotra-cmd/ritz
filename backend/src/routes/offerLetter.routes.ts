import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { db } from '../utils/db';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { authenticateCandidate } from '../middleware/candidateAuth';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import { generateLetterForOfferCase } from '../services/offerLetter.service';
import { logger } from '../utils/logger';

const router = Router();

const signSchema = z.object({ signatureName: z.string().min(1).max(200) });

// ── Candidate-facing routes (mounted BEFORE staff auth) ──
// GET /api/offer-letters/candidate/:caseId
router.get('/candidate/:caseId', authenticateCandidate, async (req: Request, res: Response) => {
  try {
    const offerLetter = await db.offerLetter.findFirst({
      where: {
        offerCaseId: req.params.caseId,
        offerCase: { candidate: { id: req.candidate!.id } },
        status: { in: ['RELEASED', 'SIGNED'] },
      },
      include: { template: true },
    });
    if (!offerLetter) { res.status(404).json({ error: 'Offer letter not found' }); return; }

    if (!offerLetter.candidateViewedAt) {
      await db.offerLetter.update({ where: { id: offerLetter.id }, data: { candidateViewedAt: new Date() } });
    }
    res.json({ offerLetter });
  } catch (err) {
    logger.error('Candidate view letter error', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/offer-letters/candidate/:caseId/sign
router.post('/candidate/:caseId/sign', authenticateCandidate, validate(signSchema), async (req: Request, res: Response) => {
  try {
    const { signatureName } = req.body;
    const offerLetter = await db.offerLetter.findFirst({
      where: {
        offerCaseId: req.params.caseId,
        offerCase: { candidate: { id: req.candidate!.id } },
        status: 'RELEASED',
      },
    });
    if (!offerLetter) { res.status(404).json({ error: 'Offer not found or already signed' }); return; }

    await db.$transaction(async (tx) => {
      await tx.offerLetter.update({
        where: { id: offerLetter.id },
        data: {
          status: 'SIGNED',
          candidateSignedAt: new Date(),
          signatureName,
          signatureIp: req.ip,
          signatureUserAgent: req.headers['user-agent'],
        },
      });
      await tx.offerCase.update({ where: { id: req.params.caseId }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
      await tx.onboardingCase.create({ data: { offerCaseId: req.params.caseId, status: 'PENDING' } });
    });

    // Regenerate PDF with signature block asynchronously
    generateLetterForOfferCase(req.params.caseId, undefined, 'Candidate e-signed').catch((e) =>
      logger.error('Re-sign PDF error', { e }),
    );

    res.json({ ok: true });
  } catch (err) {
    logger.error('Sign offer error', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/offer-letters/candidate/:caseId/decline
router.post('/candidate/:caseId/decline', authenticateCandidate, async (req: Request, res: Response) => {
  try {
    const offerLetter = await db.offerLetter.findFirst({
      where: { offerCaseId: req.params.caseId, offerCase: { candidate: { id: req.candidate!.id } }, status: 'RELEASED' },
    });
    if (!offerLetter) { res.status(404).json({ error: 'Offer not found' }); return; }

    await db.$transaction(async (tx) => {
      await tx.offerLetter.update({ where: { id: offerLetter.id }, data: { status: 'DECLINED', candidateDeclinedAt: new Date() } });
      await tx.offerCase.update({ where: { id: req.params.caseId }, data: { status: 'DECLINED', declinedAt: new Date() } });
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error('Decline offer error', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Staff routes ──
router.use(authenticate);

// POST /api/offer-letters/generate/:caseId
router.post(
  '/generate/:caseId',
  authorize('TA_MANAGER', 'ADMIN', 'SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { offerLetterId, pdfPath } = await generateLetterForOfferCase(req.params.caseId, req.user!.id);
      res.json({ offerLetterId, pdfPath });
    } catch (err) {
      logger.error('Generate letter error', { err });
      res.status(500).json({ error: String(err) });
    }
  },
);

// POST /api/offer-letters/release/:caseId
router.post(
  '/release/:caseId',
  authorize('TA_MANAGER', 'ADMIN', 'SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const offerLetter = await db.offerLetter.findFirst({
        where: { offerCaseId: req.params.caseId, status: 'DRAFT' },
      });
      if (!offerLetter) { res.status(404).json({ error: 'Draft offer letter not found' }); return; }

      await db.$transaction(async (tx) => {
        await tx.offerLetter.update({
          where: { id: offerLetter.id },
          data: { status: 'RELEASED', releasedAt: new Date(), releasedById: req.user!.id },
        });
        await tx.offerCase.update({ where: { id: req.params.caseId }, data: { status: 'OFFER_RELEASED', offerReleasedAt: new Date() } });
      });
      // TODO: send offer-released email to candidate
      res.json({ ok: true });
    } catch (err) {
      logger.error('Release letter error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// GET /api/offer-letters/pdf/:caseId — stream PDF
router.get('/pdf/:caseId', authenticate, async (req: Request, res: Response) => {
  try {
    const offerLetter = await db.offerLetter.findFirst({
      where: { offerCaseId: req.params.caseId },
      select: { pdfPath: true },
    });
    if (!offerLetter?.pdfPath) { res.status(404).json({ error: 'PDF not found' }); return; }

    // Resolve path per BUILD_SPEC §9.4 gotcha — strip leading slash
    const resolved = path.join(process.cwd(), offerLetter.pdfPath.replace(/^\//, ''));
    if (!fs.existsSync(resolved)) { res.status(404).json({ error: 'PDF file missing' }); return; }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="offer-letter.pdf"`);
    fs.createReadStream(resolved).pipe(res);
  } catch (err) {
    logger.error('PDF stream error', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
