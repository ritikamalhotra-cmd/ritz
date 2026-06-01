import { RequestHandler } from 'express';
import { db } from '../utils/db';

declare global {
  namespace Express {
    interface Request {
      candidate?: {
        id: string;
        fullName: string;
        email: string;
      };
    }
  }
}

export const authenticateCandidate: RequestHandler = async (req, res, next) => {
  const token = req.headers['x-portal-token'] as string | undefined;
  if (!token) {
    res.status(401).json({ error: 'Portal token required' });
    return;
  }
  const candidate = await db.candidate.findUnique({ where: { portalToken: token } });
  if (
    !candidate ||
    !candidate.portalTokenExpiresAt ||
    candidate.portalTokenExpiresAt < new Date()
  ) {
    res.status(401).json({ error: 'Invalid or expired portal token' });
    return;
  }
  req.candidate = { id: candidate.id, fullName: candidate.fullName, email: candidate.email };
  next();
};
