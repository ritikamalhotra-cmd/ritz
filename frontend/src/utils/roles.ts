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

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  TA_MANAGER: 'TA Manager',
  RECRUITER: 'Recruiter',
  HIRING_MANAGER: 'Hiring Manager',
  HOD: 'Head of Department',
  HR_HEAD: 'HR Head',
  HRBP: 'HRBP',
  COMP_FINANCE: 'Comp & Finance',
  ONBOARDING_SPOC: 'Onboarding SPOC',
  EMPLOYEE: 'Employee',
};

export function canCreateOffer(role: string): boolean {
  return ['RECRUITER', 'TA_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role);
}

export function canApprove(role: string): boolean {
  return ['TA_MANAGER', 'HOD', 'HR_HEAD', 'ADMIN', 'SUPER_ADMIN'].includes(role);
}

export function canViewComp(role: string): boolean {
  return !['HIRING_MANAGER', 'HRBP', 'ONBOARDING_SPOC', 'EMPLOYEE'].includes(role);
}

export function canAccessAdmin(role: string): boolean {
  return ['ADMIN', 'SUPER_ADMIN'].includes(role);
}
