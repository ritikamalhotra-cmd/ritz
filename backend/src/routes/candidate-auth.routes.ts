import { Router, Request, Response } from 'express';
import { db } from '../utils/db';
import { generateSecureToken, generateOtp } from '../utils/crypto';
import { validate } from '../middleware/validate';
import { otpLimiter } from '../middleware/rateLimiter';
import { z } from 'zod';
import { logger } from '../utils/logger';

const router = Router();

const requestOtpSchema = z.object({ email: z.string().email() });
const verifyOtpSchema = z.object({ email: z.string().email(), otp: z.string().length(6) });

// POST /api/candidate/portal/request-otp — always 200 (enumeration protection)
router.post('/request-otp', otpLimiter, validate(requestOtpSchema), async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const candidate = await db.candidate.findUnique({ where: { email } });
    if (candidate) {
      const otp = generateOtp();
      await db.candidate.update({
        where: { id: candidate.id },
        data: { portalOtp: otp, portalOtpExpiry: new Date(Date.now() + 15 * 60 * 1000) },
      });
      // TODO: email.service.ts → sendOtpEmail(candidate.email, otp)
      logger.info('OTP generated', { candidateId: candidate.id });
    }
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

// POST /api/candidate/portal/verify-otp
router.post('/verify-otp', otpLimiter, validate(verifyOtpSchema), async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;
    const candidate = await db.candidate.findUnique({ where: { email } });

    if (
      !candidate ||
      !candidate.portalOtp ||
      !candidate.portalOtpExpiry ||
      candidate.portalOtp !== otp ||
      candidate.portalOtpExpiry < new Date()
    ) {
      res.status(401).json({ error: 'Invalid or expired OTP' });
      return;
    }

    const token = generateSecureToken(32);
    await db.candidate.update({
      where: { id: candidate.id },
      data: {
        portalToken: token,
        portalTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        portalOtp: null,
        portalOtpExpiry: null,
      },
    });

    res.json({ portalToken: token, candidateId: candidate.id, fullName: candidate.fullName });
  } catch (err) {
    logger.error('Verify OTP error', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
