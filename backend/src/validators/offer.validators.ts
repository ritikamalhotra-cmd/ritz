import { z } from 'zod';

export const createOfferSchema = z.object({
  // Step 1 — Candidate
  candidate: z.object({
    fullName: z.string().min(1).max(200),
    email: z.string().email(),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedIn: z.string().url().optional().or(z.literal('')),
    portfolio: z.string().url().optional().or(z.literal('')),
  }),
  // Step 2 — Role
  roleTitle: z.string().min(1).max(200),
  department: z.string().min(1).max(100),
  jobFamily: z.string().optional(),
  level: z.string().optional(),
  grade: z.string().optional(),
  employmentType: z.enum(['PERMANENT', 'CONTRACT', 'INTERN']).default('PERMANENT'),
  location: z.string().optional(),
  workMode: z.enum(['ONSITE', 'HYBRID', 'REMOTE']).default('ONSITE'),
  // Step 3 — Compensation
  compensation: z.object({
    proposedDesignation: z.string().optional(),
    proposedFixed: z.number().positive(),
    proposedVariable: z.number().min(0).default(0),
    proposedTotalCash: z.number().positive(),
    proposedTotalCTC: z.number().positive(),
    joiningBonus: z.number().min(0).default(0),
    esopGrant: z.number().min(0).default(0),
    fixedHikePercent: z.number().optional(),
    totalCTCHikePercent: z.number().optional(),
  }),
  pfOptIn: z.boolean().default(true),
  // Step 4 — Current package
  currentFixed: z.number().optional(),
  currentVariable: z.number().optional(),
  currentTotalCTC: z.number().optional(),
  expectedFixed: z.number().optional(),
  expectedTotal: z.number().optional(),
  minimumAcceptable: z.number().optional(),
  // Step 5 — Timeline
  preferredDOJ: z.string().datetime().optional().or(z.literal('')),
  earliestDOJ: z.string().datetime().optional().or(z.literal('')),
  noticePeriodDays: z.number().int().min(0).optional(),
  noticePeriodBuyout: z.boolean().default(false),
  // Step 6 — Joining risk
  hasOfferInHand: z.boolean().default(false),
  offerInHandCompany: z.string().optional(),
  offerInHandAmount: z.number().optional(),
  whyLikelyToJoin: z.string().optional(),
  whyMayNotJoin: z.string().optional(),
  recruiterConfidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  convictionScore: z.number().int().min(1).max(5).optional(),
  // Optional
  hiringManagerId: z.string().optional(),
  hodId: z.string().optional(),
  recruiterId: z.string().optional(),
});

export const updateOfferStatusSchema = z.object({
  status: z.string().min(1),
  reason: z.string().optional(),
});

export const offerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  department: z.string().optional(),
  search: z.string().optional(),
});
