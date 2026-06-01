import { computeSalaryBreakup } from '../services/salaryBreakup.service';

describe('computeSalaryBreakup', () => {
  describe('PF opt-in', () => {
    const result = computeSalaryBreakup({ annualFixed: 2400000, pfOptIn: true });

    it('monthlyGross equals annualFixed / 12', () => {
      expect(result.monthlyGross).toBe(200000);
    });

    it('Basic is ~49.55% of monthlyGross rounded to nearest 50', () => {
      // 200000 * 0.4955 = 99100, nearest 50 = 99100
      expect(result.basic % 50).toBe(0);
      expect(Math.abs(result.basic - 200000 * 0.4955)).toBeLessThan(50);
    });

    it('HRA is 50% of Basic rounded to nearest 50', () => {
      expect(result.hra % 50).toBe(0);
      expect(Math.abs(result.hra - result.basic * 0.5)).toBeLessThan(50);
    });

    it('FixedPerks is 13150', () => {
      expect(result.fixedPerks).toBe(13150);
    });

    it('PF employer = min(basic, 15000) * 12%', () => {
      const expectedPf = Math.min(result.basic, 15000) * 0.12;
      expect(result.pfEmployer).toBeCloseTo(expectedPf, 0);
    });

    it('SpecialAllowance balances: basic+hra+fixedPerks+pf+special == monthlyGross', () => {
      const sum = result.basic + result.hra + result.fixedPerks + result.pfEmployer + result.specialAllowance;
      expect(Math.abs(sum - result.monthlyGross)).toBeLessThan(1);
    });

    it('InHand = CTC - pfEmployee - pfEmployer', () => {
      const expectedInHand = result.ctcMonthly - result.pfEmployee - result.pfEmployer;
      expect(result.inHand).toBeCloseTo(expectedInHand, 0);
    });
  });

  describe('PF opt-out', () => {
    const result = computeSalaryBreakup({ annualFixed: 1200000, pfOptIn: false });

    it('pfEmployer is 0', () => {
      expect(result.pfEmployer).toBe(0);
    });

    it('pfEmployee is 0', () => {
      expect(result.pfEmployee).toBe(0);
    });

    it('special allowance still balances', () => {
      const sum = result.basic + result.hra + result.fixedPerks + result.specialAllowance;
      expect(Math.abs(sum - result.monthlyGross)).toBeLessThan(1);
    });
  });

  describe('high salary (Basic > 15000 PF cap)', () => {
    const result = computeSalaryBreakup({ annualFixed: 6000000, pfOptIn: true });

    it('PF is capped at 15000 * 12%', () => {
      expect(result.pfEmployer).toBe(1800);
    });
  });

  describe('edge cases', () => {
    it('handles minimum salary gracefully', () => {
      const result = computeSalaryBreakup({ annualFixed: 240000, pfOptIn: true });
      expect(result.monthlyGross).toBe(20000);
      expect(result.specialAllowance).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('amountInWords', () => {
  const { amountInWords } = require('../services/salaryBreakup.service');

  it('2400000 → "Twenty-Four Lakh"', () => {
    expect(amountInWords(2400000)).toBe('Twenty-Four Lakh');
  });

  it('100000 → "One Lakh"', () => {
    expect(amountInWords(100000)).toBe('One Lakh');
  });

  it('10000000 → "One Crore"', () => {
    expect(amountInWords(10000000)).toBe('One Crore');
  });

  it('0 → "Zero"', () => {
    expect(amountInWords(0)).toBe('Zero');
  });

  it('1500 → "One Thousand Five Hundred"', () => {
    expect(amountInWords(1500)).toBe('One Thousand Five Hundred');
  });
});
