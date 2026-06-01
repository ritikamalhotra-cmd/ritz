import { RequestHandler } from 'express';
import { db } from '../utils/db';

export interface AuditOptions {
  action: string;
  entity: string;
  getEntityId?: (req: Express.Request) => string | undefined;
}

export function auditLog(opts: AuditOptions): RequestHandler {
  return async (req, _res, next) => {
    try {
      await db.auditLog.create({
        data: {
          userId: req.user?.id,
          action: opts.action,
          entity: opts.entity,
          entityId: opts.getEntityId?.(req as unknown as Express.Request),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      });
    } catch {
      // Audit failures must never block the request
    }
    next();
  };
}
