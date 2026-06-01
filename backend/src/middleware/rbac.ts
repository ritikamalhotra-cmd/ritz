import { RequestHandler } from 'express';

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  TA_MANAGER: 'TA_MANAGER',
  RECRUITER: 'RECRUITER',
  HIRING_MANAGER: 'HIRING_MANAGER',
  HOD: 'HOD',
  HR_HEAD: 'HR_HEAD',
  HRBP: 'HRBP',
  COMP_FINANCE: 'COMP_FINANCE',
  ONBOARDING_SPOC: 'ONBOARDING_SPOC',
  EMPLOYEE: 'EMPLOYEE',
} as const;

export type RoleName = keyof typeof ROLES;

export function authorize(...roles: RoleName[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role as RoleName)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
