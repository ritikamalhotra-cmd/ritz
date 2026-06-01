import { RequestHandler } from 'express';
import { POST_HOD_STATUSES, POST_ACCEPTANCE_STATUSES } from '../constants/statuses';

declare global {
  namespace Express {
    interface Request {
      dataScope?: Record<string, unknown>;
    }
  }
}

export const attachDataScope: RequestHandler = (req, _res, next) => {
  if (!req.user) { next(); return; }

  const { role, id: userId, department } = req.user;

  switch (role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
    case 'HR_HEAD':
    case 'TA_MANAGER':
    case 'COMP_FINANCE':
      req.dataScope = {};
      break;

    case 'RECRUITER':
      req.dataScope = {
        OR: [{ createdById: userId }, { recruiterId: userId }],
      };
      break;

    case 'HIRING_MANAGER':
      req.dataScope = { hiringManagerId: userId };
      break;

    case 'HOD':
      req.dataScope = {
        OR: [
          { department },
          { hodId: userId },
          { status: { in: POST_HOD_STATUSES } },
        ],
      };
      break;

    case 'HRBP':
    case 'ONBOARDING_SPOC':
      req.dataScope = { status: { in: POST_ACCEPTANCE_STATUSES } };
      break;

    default:
      req.dataScope = { id: { in: [] } };
  }

  next();
};
