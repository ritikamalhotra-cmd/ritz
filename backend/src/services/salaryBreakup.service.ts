// India salary breakup formula per BUILD_SPEC.md §9.2

const FIXED_PERKS = 13150; // Medical(1250)+Telephone(1000)+Meal(2200)+Books(1000)+Attire(5000)+CarPerq(2700)
const BASIC_PCT = 0.4955;
const HRA_PCT = 0.5;
const PF_PCT = 0.12;
const PF_CAP = 15000;
const ROUND_TO = 50;

function roundToNearest(n: number, nearest: number): number {
  return Math.round(n / nearest) * nearest;
}

export interface SalaryBreakup {
  annualFixed: number;
  monthlyGross: number;
  basic: number;
  hra: number;
  fixedPerks: number;
  pfEmployer: number;
  specialAllowance: number;
  totalA: number;       // gross salary (excl PF)
  totalB: number;       // employer statutory (PF)
  ctcMonthly: number;   // A + B
  pfEmployee: number;   // matching deduction
  totalD: number;       // employee statutory deduction
  inHand: number;       // CTC - pfEmployee - pfEmployer
}

export function computeSalaryBreakup(opts: {
  annualFixed: number;
  pfOptIn: boolean;
}): SalaryBreakup {
  const { annualFixed, pfOptIn } = opts;
  const monthlyGross = annualFixed / 12;

  const basic = roundToNearest(monthlyGross * BASIC_PCT, ROUND_TO);
  const hra = roundToNearest(basic * HRA_PCT, ROUND_TO);
  const fixedPerks = FIXED_PERKS;

  const pfEmployer = pfOptIn ? Math.round(Math.min(basic, PF_CAP) * PF_PCT) : 0;
  const pfEmployee = pfEmployer;

  // Special Allowance is the residual — keeps Σcomponents == monthlyGross exactly
  const specialAllowance = monthlyGross - basic - hra - fixedPerks - pfEmployer;

  const totalA = basic + hra + fixedPerks + specialAllowance;
  const totalB = pfEmployer;
  const ctcMonthly = totalA + totalB;
  const totalD = pfEmployee;
  const inHand = ctcMonthly - pfEmployee - pfEmployer;

  return {
    annualFixed,
    monthlyGross,
    basic,
    hra,
    fixedPerks,
    pfEmployer,
    specialAllowance,
    totalA,
    totalB,
    ctcMonthly,
    pfEmployee,
    totalD,
    inHand,
  };
}

// ─── Amount-in-words (Indian numbering) — verbatim from BUILD_SPEC.md §16.1 ───

const WORDS_BELOW_20 = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const WORDS_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n === 0) return '';
  if (n < 20) return WORDS_BELOW_20[n];
  return WORDS_TENS[Math.floor(n / 10)] + (n % 10 ? '-' + WORDS_BELOW_20[n % 10] : '');
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100), rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(WORDS_BELOW_20[h] + ' Hundred');
  if (rest) parts.push(twoDigits(rest));
  return parts.join(' ');
}

export function amountInWords(n: number): string {
  if (!n || isNaN(n)) return 'Zero';
  const v = Math.round(Math.abs(n));
  if (v === 0) return 'Zero';
  const crore = Math.floor(v / 10000000);
  const lakh = Math.floor((v % 10000000) / 100000);
  const thousand = Math.floor((v % 100000) / 1000);
  const rest = v % 1000;
  const parts: string[] = [];
  if (crore) parts.push(twoDigits(crore) + ' Crore');
  if (lakh) parts.push(twoDigits(lakh) + ' Lakh');
  if (thousand) parts.push(twoDigits(thousand) + ' Thousand');
  if (rest) parts.push(threeDigits(rest));
  return parts.filter(Boolean).join(' ');
}

// ─── INR formatter — verbatim from BUILD_SPEC.md §16.2 ───

export function formatINR(n: number): string {
  if (!n || isNaN(n)) return '0';
  const s = Math.round(Math.abs(n)).toString();
  if (s.length <= 3) return (n < 0 ? '-' : '') + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const pairs: string[] = [];
  for (let i = rest.length; i > 0; i -= 2) {
    pairs.unshift(rest.slice(Math.max(0, i - 2), i));
  }
  return (n < 0 ? '-' : '') + pairs.join(',') + ',' + last3;
}
