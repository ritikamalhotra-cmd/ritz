import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../utils/db';
import { signAccessToken, signRefreshToken } from '../utils/jwt';
import { validate } from '../middleware/validate';
import { googleAuthSchema } from '../validators/auth.validators';
import { logger } from '../utils/logger';

const router = Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const SSO_DOMAIN = process.env.SSO_DOMAIN || 'dotpe.in';
const isProd = process.env.NODE_ENV === 'production';
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN;

// POST /api/auth/google/auth
router.post('/auth', validate(googleAuthSchema), async (req: Request, res: Response) => {
  try {
    const { credential } = req.body;

    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch {
      res.status(401).json({ error: 'Invalid Google credential' });
      return;
    }

    const payload = ticket.getPayload();
    if (!payload?.email) {
      res.status(401).json({ error: 'No email in Google token' });
      return;
    }

    const emailDomain = payload.email.split('@')[1];
    if (emailDomain !== SSO_DOMAIN) {
      res.status(403).json({ error: `Only @${SSO_DOMAIN} accounts are allowed` });
      return;
    }

    let user = await db.user.findUnique({ where: { email: payload.email } });
    if (!user) {
      user = await db.user.create({
        data: {
          email: payload.email,
          firstName: payload.given_name || payload.email.split('@')[0],
          lastName: payload.family_name || '',
          role: 'EMPLOYEE',
          authProvider: 'GOOGLE',
          googleId: payload.sub,
          avatarUrl: payload.picture,
        },
      });
    } else if (user.authProvider === 'LOCAL') {
      // Update to link Google account
      await db.user.update({
        where: { id: user.id },
        data: { googleId: payload.sub, avatarUrl: payload.picture, lastLoginAt: new Date() },
      });
    }

    if (!user.isActive) {
      res.status(403).json({ error: 'Account disabled' });
      return;
    }

    const tokenPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    await db.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });

    const base = { httpOnly: true, sameSite: 'strict' as const, secure: isProd, ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}) };
    res.cookie('access_token', accessToken, { ...base, maxAge: 15 * 60 * 1000 });
    res.cookie('refresh_token', refreshToken, { ...base, maxAge: 7 * 24 * 60 * 60 * 1000 });

    res.json({ user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName } });
  } catch (err) {
    logger.error('Google auth error', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
