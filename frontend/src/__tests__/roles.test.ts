import { canCreateOffer, canApprove, canViewComp, canAccessAdmin } from '../utils/roles';

describe('canCreateOffer', () => {
  it('allows RECRUITER', () => expect(canCreateOffer('RECRUITER')).toBe(true));
  it('allows TA_MANAGER', () => expect(canCreateOffer('TA_MANAGER')).toBe(true));
  it('denies HIRING_MANAGER', () => expect(canCreateOffer('HIRING_MANAGER')).toBe(false));
  it('denies EMPLOYEE', () => expect(canCreateOffer('EMPLOYEE')).toBe(false));
});

describe('canApprove', () => {
  it('allows TA_MANAGER', () => expect(canApprove('TA_MANAGER')).toBe(true));
  it('allows HOD', () => expect(canApprove('HOD')).toBe(true));
  it('allows HR_HEAD', () => expect(canApprove('HR_HEAD')).toBe(true));
  it('denies RECRUITER', () => expect(canApprove('RECRUITER')).toBe(false));
  it('denies EMPLOYEE', () => expect(canApprove('EMPLOYEE')).toBe(false));
});

describe('canViewComp', () => {
  it('RECRUITER can view comp', () => expect(canViewComp('RECRUITER')).toBe(true));
  it('HIRING_MANAGER cannot view comp', () => expect(canViewComp('HIRING_MANAGER')).toBe(false));
  it('HRBP cannot view comp', () => expect(canViewComp('HRBP')).toBe(false));
  it('ONBOARDING_SPOC cannot view comp', () => expect(canViewComp('ONBOARDING_SPOC')).toBe(false));
  it('TA_MANAGER can view comp', () => expect(canViewComp('TA_MANAGER')).toBe(true));
});

describe('canAccessAdmin', () => {
  it('ADMIN can access admin', () => expect(canAccessAdmin('ADMIN')).toBe(true));
  it('SUPER_ADMIN can access admin', () => expect(canAccessAdmin('SUPER_ADMIN')).toBe(true));
  it('RECRUITER cannot access admin', () => expect(canAccessAdmin('RECRUITER')).toBe(false));
});
