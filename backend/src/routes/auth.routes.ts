import { Router, Request, Response } from 'express';
import { db } from '../utils/db';
import { hashPassword, comparePassword, generateSecureToken } from '../utils/crypto';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/auth.validators';
import { logger } from '../utils/logger';

const router = Router();
const isProd = process.env.NODE_ENV === 'production';
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN;

function setCookies(res: Response, accessToken: string, refreshToken: string, _req?: Request) {
  const base = {
    httpOnly: true,
    sameSite: isProd ? ('strict' as const) : ('lax' as const),
    secure: isProd,
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  };
  res.cookie('access_token', accessToken, { ...base, maxAge: 15 * 60 * 1000 });
  res.cookie('refresh_token', refreshToken, { ...base, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

function clearCookies(res: Response, _req?: Request) {
  const base = {
    httpOnly: true,
    sameSite: isProd ? ('strict' as const) : ('lax' as const),
    secure: isProd,
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  };
  res.clearCookie('access_token', base);
  res.clearCookie('refresh_token', base);
}

// POST /api/auth/register
router.post('/register', validate(registerSchema), async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName } = req.body;
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
    const passwordHash = await hashPassword(password);
    const user = await db.user.create({
      data: { email, passwordHash, firstName, lastName },
      select: { id: true, email: true, role: true, firstName: true, lastName: true },
    });
    res.status(201).json({ user });
  } catch (err) {
    logger.error('Register error', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await db.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      res.status(423).json({ error: 'Account temporarily locked. Try again later.' });
      return;
    }

    if (!user.passwordHash) {
      res.status(401).json({ error: 'Please use Google SSO to login' });
      return;
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      const attempts = user.failedAttempts + 1;
      const lockUntil = attempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null;
      await db.user.update({
        where: { id: user.id },
        data: { failedAttempts: attempts, ...(lockUntil ? { lockedUntil: lockUntil } : {}) },
      });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    await db.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await db.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    setCookies(res, accessToken, refreshToken, req);
    res.json({
      user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName },
    });
  } catch (err) {
    logger.error('Login error', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refresh_token as string | undefined;
    if (!token) { res.status(401).json({ error: 'No refresh token' }); return; }

    let payload;
    try { payload = verifyRefreshToken(token); } catch {
      res.status(401).json({ error: 'Invalid refresh token' }); return;
    }

    const stored = await db.refreshToken.findUnique({ where: { token } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      res.status(401).json({ error: 'Refresh token expired or revoked' }); return;
    }

    const user = await db.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) { res.status(401).json({ error: 'User not found' }); return; }

    await db.refreshToken.update({ where: { token }, data: { revokedAt: new Date() } });

    const newPayload = { sub: user.id, email: user.email, role: user.role };
    const newAccess = signAccessToken(newPayload);
    const newRefresh = signRefreshToken(newPayload);

    await db.refreshToken.create({
      data: { token: newRefresh, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });

    setCookies(res, newAccess, newRefresh, req);
    res.json({ ok: true });
  } catch (err) {
    logger.error('Refresh error', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refresh_token as string | undefined;
    if (token) {
      await db.refreshToken.updateMany({
        where: { token, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearCookies(res, req);
    res.json({ ok: true });
  } catch {
    clearCookies(res, req);
    res.json({ ok: true });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await db.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true, email: true, role: true, firstName: true, lastName: true,
        department: true, avatarUrl: true, authProvider: true, createdAt: true,
      },
    });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({ user });
  } catch (err) {
    logger.error('/me error', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', validate(forgotPasswordSchema), async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const user = await db.user.findUnique({ where: { email } });
    // Always return 200 — email enumeration protection
    if (user) {
      const token = generateSecureToken();
      await db.user.update({
        where: { id: user.id },
        data: { resetToken: token, resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000) },
      });
      // TODO: send reset email via email.service.ts
      logger.info('Password reset token generated', { userId: user.id });
    }
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', validate(resetPasswordSchema), async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    const user = await db.user.findFirst({
      where: { resetToken: token, resetTokenExpiry: { gt: new Date() } },
    });
    if (!user) { res.status(400).json({ error: 'Invalid or expired reset token' }); return; }
    const passwordHash = await hashPassword(password);
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExpiry: null, failedAttempts: 0, lockedUntil: null },
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error('Reset password error', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
