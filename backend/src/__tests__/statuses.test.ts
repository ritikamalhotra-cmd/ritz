import { VALID_TRANSITIONS, TERMINAL_STATUSES } from '../constants/statuses';

describe('Offer state machine', () => {
  it('DRAFT can only transition to PENDING_TA_APPROVAL', () => {
    expect(VALID_TRANSITIONS['DRAFT']).toEqual(['PENDING_TA_APPROVAL']);
  });

  it('PENDING_TA_APPROVAL can send-back, reject, or advance to HOD', () => {
    const t = VALID_TRANSITIONS['PENDING_TA_APPROVAL'];
    expect(t).toContain('SENT_BACK_BY_TA');
    expect(t).toContain('REJECTED');
    expect(t).toContain('PENDING_HOD_APPROVAL');
  });

  it('SENT_BACK_BY_HOD resets to PENDING_TA_APPROVAL (not recruiter)', () => {
    expect(VALID_TRANSITIONS['SENT_BACK_BY_HOD']).toEqual(['PENDING_TA_APPROVAL']);
  });

  it('SENT_BACK_BY_HR_HEAD resets to PENDING_TA_APPROVAL', () => {
    expect(VALID_TRANSITIONS['SENT_BACK_BY_HR_HEAD']).toEqual(['PENDING_TA_APPROVAL']);
  });

  it('APPROVED can only go to OFFER_RELEASED', () => {
    expect(VALID_TRANSITIONS['APPROVED']).toEqual(['OFFER_RELEASED']);
  });

  it('terminal states have no outbound transitions', () => {
    for (const status of TERMINAL_STATUSES) {
      expect(VALID_TRANSITIONS[status]).toBeUndefined();
    }
  });

  it('OFFER_RELEASED has ACCEPTED, DECLINED, WITHDRAWN, CLOSED paths', () => {
    const t = VALID_TRANSITIONS['OFFER_RELEASED'];
    expect(t).toContain('ACCEPTED');
    expect(t).toContain('DECLINED');
    expect(t).toContain('WITHDRAWN');
    expect(t).toContain('CLOSED');
  });
});
