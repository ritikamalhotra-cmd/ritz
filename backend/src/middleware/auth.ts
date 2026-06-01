import { RequestHandler } from 'express';
import { verifyAccessToken, JwtPayload } from '../utils/jwt';
import { db } from '../utils/db';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        department?: string | null;
        realActorId?: string; // impersonation
      };
    }
  }
}

export const authenticate: RequestHandler = async (req, res, next) => {
  try {
    // Support both Bearer token (Authorization header) and cookie
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else {
      token = req.cookies?.access_token as string | undefined;
    }

    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    let payload: JwtPayload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const user = await db.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, department: true, isActive: true },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'User not found or inactive' });
      return;
    }

    // Impersonation: SUPER_ADMIN can impersonate via X-Impersonation-Token
    const impersonationId = req.headers['x-impersonation-token'] as string | undefined;
    if (impersonationId && user.role === 'SUPER_ADMIN') {
      const target = await db.user.findUnique({
        where: { id: impersonationId },
        select: { id: true, email: true, role: true, department: true, isActive: true },
      });
      if (target && target.isActive) {
        req.user = { ...target, realActorId: user.id };
        next();
        return;
      }
    }

    req.user = { id: user.id, email: user.email, role: user.role, department: user.department };
    next();
  } catch (err) {
    next(err);
  }
};
