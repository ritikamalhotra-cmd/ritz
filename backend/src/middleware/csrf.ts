import { RequestHandler } from 'express';
import crypto from 'crypto';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const EXEMPT_EXACT = new Set([
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/google/auth',
]);
const EXEMPT_PREFIXES = [
  '/api/candidate/portal/',
  '/api/offer-letters/candidate/',
];

export const csrfProtection: RequestHandler = (req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production';

  // In production: Bearer token requests are inherently CSRF-safe
  // (localStorage tokens are not auto-sent by browsers, unlike cookies)
  if (isProd && req.headers.authorization?.startsWith('Bearer ')) {
    next(); return;
  }

  // Set CSRF cookie for cookie-based sessions (local dev)
  let token = req.cookies?.csrf_token as string | undefined;
  if (!token) token = crypto.randomBytes(32).toString('hex');
  res.cookie('csrf_token', token, {
    httpOnly: false,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    path: '/',
  });

  const isExempt =
    EXEMPT_EXACT.has(req.path) ||
    EXEMPT_PREFIXES.some((p) => req.path.startsWith(p));

  if (isProd && STATE_CHANGING_METHODS.has(req.method) && !isExempt) {
    const header = req.headers['x-csrf-token'] as string | undefined;
    const cookie = req.cookies?.csrf_token as string | undefined;
    if (!header || !cookie || header !== cookie) {
      res.status(403).json({ error: 'CSRF token missing or invalid' });
      return;
    }
  }

  next();
};
