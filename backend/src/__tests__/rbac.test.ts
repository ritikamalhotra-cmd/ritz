import { authorize, ROLES } from '../middleware/rbac';
import { Request, Response, NextFunction } from 'express';

function mockReq(role?: string): Partial<Request> {
  return { user: role ? { id: 'u1', email: 'x@dotpe.in', role } : undefined } as Partial<Request>;
}

function mockRes(): { status: jest.Mock; json: jest.Mock; statusCode: number } {
  const res = { status: jest.fn(), json: jest.fn(), statusCode: 200 };
  res.status.mockReturnValue(res);
  return res;
}

describe('authorize middleware', () => {
  it('calls next() when role matches', () => {
    const mw = authorize('RECRUITER');
    const next = jest.fn();
    const req = mockReq('RECRUITER');
    mw(req as Request, mockRes() as unknown as Response, next as NextFunction);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when role does not match', () => {
    const mw = authorize('ADMIN');
    const next = jest.fn();
    const res = mockRes();
    const req = mockReq('RECRUITER');
    mw(req as Request, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when user is not authenticated', () => {
    const mw = authorize('RECRUITER');
    const next = jest.fn();
    const res = mockRes();
    mw(mockReq() as Request, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('allows multiple roles', () => {
    const mw = authorize('RECRUITER', 'TA_MANAGER', 'ADMIN');
    const next = jest.fn();
    const req = mockReq('TA_MANAGER');
    mw(req as Request, mockRes() as unknown as Response, next as NextFunction);
    expect(next).toHaveBeenCalled();
  });

  it('ROLES constants are defined correctly', () => {
    expect(ROLES.SUPER_ADMIN).toBe('SUPER_ADMIN');
    expect(ROLES.HR_HEAD).toBe('HR_HEAD');
    expect(ROLES.TA_MANAGER).toBe('TA_MANAGER');
    expect(ROLES.RECRUITER).toBe('RECRUITER');
  });
});
