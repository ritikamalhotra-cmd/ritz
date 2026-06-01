import { attachDataScope } from '../middleware/dataScope';
import { POST_HOD_STATUSES, POST_ACCEPTANCE_STATUSES } from '../constants/statuses';
import { Request, Response, NextFunction } from 'express';

function makeReq(role: string, extra: Record<string, unknown> = {}): Partial<Request> {
  return { user: { id: 'u1', email: 'x@dotpe.in', role, department: 'Engineering', ...extra } } as Partial<Request>;
}

function runMiddleware(req: Partial<Request>): Record<string, unknown> | undefined {
  const next = jest.fn();
  attachDataScope(req as Request, {} as Response, next as NextFunction);
  return (req as Request).dataScope;
}

describe('attachDataScope', () => {
  it('SUPER_ADMIN gets empty scope', () => {
    expect(runMiddleware(makeReq('SUPER_ADMIN'))).toEqual({});
  });

  it('ADMIN gets empty scope', () => {
    expect(runMiddleware(makeReq('ADMIN'))).toEqual({});
  });

  it('HR_HEAD gets empty scope', () => {
    expect(runMiddleware(makeReq('HR_HEAD'))).toEqual({});
  });

  it('TA_MANAGER gets empty scope', () => {
    expect(runMiddleware(makeReq('TA_MANAGER'))).toEqual({});
  });

  it('COMP_FINANCE gets empty scope', () => {
    expect(runMiddleware(makeReq('COMP_FINANCE'))).toEqual({});
  });

  it('RECRUITER sees own offers only', () => {
    const scope = runMiddleware(makeReq('RECRUITER'));
    expect(scope).toHaveProperty('OR');
    const or = (scope as { OR: unknown[] }).OR;
    expect(or).toContainEqual({ createdById: 'u1' });
    expect(or).toContainEqual({ recruiterId: 'u1' });
  });

  it('HIRING_MANAGER sees own assigned offers', () => {
    const scope = runMiddleware(makeReq('HIRING_MANAGER'));
    expect(scope).toEqual({ hiringManagerId: 'u1' });
  });

  it('HOD sees department + hod assignments + post-hod statuses', () => {
    const scope = runMiddleware(makeReq('HOD')) as { OR: unknown[] };
    expect(scope.OR).toContainEqual({ department: 'Engineering' });
    expect(scope.OR).toContainEqual({ hodId: 'u1' });
    expect(scope.OR).toContainEqual({ status: { in: POST_HOD_STATUSES } });
  });

  it('HRBP sees post-acceptance statuses', () => {
    const scope = runMiddleware(makeReq('HRBP'));
    expect(scope).toEqual({ status: { in: POST_ACCEPTANCE_STATUSES } });
  });

  it('ONBOARDING_SPOC sees post-acceptance statuses', () => {
    const scope = runMiddleware(makeReq('ONBOARDING_SPOC'));
    expect(scope).toEqual({ status: { in: POST_ACCEPTANCE_STATUSES } });
  });

  it('EMPLOYEE gets empty id list (denied)', () => {
    const scope = runMiddleware(makeReq('EMPLOYEE'));
    expect(scope).toEqual({ id: { in: [] } });
  });
});
