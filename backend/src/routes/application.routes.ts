// ATS Phase 1 — Application / Pipeline routes
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { db } from '../utils/db';
import { logger } from '../utils/logger';
import { createCalendarEvent, deleteCalendarEvent } from '../services/calendar.service';
import { sendInterviewInvite, sendStageUpdate, sendCustomEmail } from '../services/email.service';

const router = Router();
router.use(authenticate);

const APP_INCLUDE = {
  candidate: { select: { id: true, fullName: true, email: true, phone: true, address: true } },
  requisition: { select: { id: true, reqNumber: true, title: true, department: true } },
  assignedTo:  { select: { id: true, firstName: true, lastName: true } },
  recruiterScreen: true,
  hmReview: true,
  interviewPlan: {
    include: {
      rounds: {
        include: { feedback: true },
        orderBy: { roundNumber: 'asc' as const },
      },
    },
  },
  stageHistory: {
    include: { changedBy: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

// ── List applications (optionally by requisitionId) ────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { requisitionId, stage, candidateId } = req.query as Record<string, string>;
    const where: any = { isActive: true };
    if (requisitionId) where.requisitionId = requisitionId;
    if (stage) where.stage = stage;
    if (candidateId) where.candidateId = candidateId;

    const apps = await db.application.findMany({
      where,
      include: APP_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    res.json(apps);
  } catch (e) { next(e); }
});

// ── Create application (add candidate to a requisition) ────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { requisitionId, candidateId, source, assignedToId, newCandidate } = req.body;

    let resolvedCandidateId = candidateId;

    // Create candidate on the fly if details provided
    if (!candidateId && newCandidate) {
      const { fullName, email, phone } = newCandidate;
      if (!fullName || !email) return res.status(400).json({ error: 'fullName and email required for new candidate' });
      const existing = await db.candidate.findUnique({ where: { email: email.toLowerCase() } });
      if (existing) {
        resolvedCandidateId = existing.id;
      } else {
        const c = await db.candidate.create({
          data: { fullName, email: email.toLowerCase(), phone },
        });
        resolvedCandidateId = c.id;
      }
    }

    if (!requisitionId || !resolvedCandidateId) {
      return res.status(400).json({ error: 'requisitionId and candidateId (or newCandidate) required' });
    }

    // Check for duplicate
    const existing = await db.application.findFirst({
      where: { requisitionId, candidateId: resolvedCandidateId },
    });
    if (existing) {
      return res.status(409).json({ error: 'Candidate already applied to this requisition', application: existing });
    }

    const app = await db.application.create({
      data: {
        requisitionId,
        candidateId: resolvedCandidateId,
        source: source || 'MANUAL',
        assignedToId: assignedToId || req.user!.id,
        stage: 'APPLIED',
      },
      include: APP_INCLUDE,
    });

    // Log initial stage history
    await db.applicationStageHistory.create({
      data: {
        applicationId: app.id,
        toStage: 'APPLIED',
        changedById: req.user!.id,
        reason: 'Application created',
      },
    });

    res.status(201).json(app);
  } catch (e) { next(e); }
});

// ── Get single application ─────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const app = await db.application.findUnique({
      where: { id: req.params.id },
      include: APP_INCLUDE,
    });
    if (!app) return res.status(404).json({ error: 'Not found' });
    res.json(app);
  } catch (e) { next(e); }
});

// ── Move stage ─────────────────────────────────────────────────────────────
router.post('/:id/move', async (req, res, next) => {
  try {
    const { stage, reason } = req.body as { stage: string; reason?: string };
    if (!stage) return res.status(400).json({ error: 'stage required' });

    const app = await db.application.findUnique({ where: { id: req.params.id } });
    if (!app) return res.status(404).json({ error: 'Not found' });

    const [updated] = await db.$transaction([
      db.application.update({
        where: { id: req.params.id },
        data: { stage: stage as any, updatedAt: new Date() },
        include: APP_INCLUDE,
      }),
      db.applicationStageHistory.create({
        data: {
          applicationId: req.params.id,
          fromStage: app.stage as any,
          toStage: stage as any,
          changedById: req.user!.id,
          reason,
        },
      }),
    ]);

    res.json(updated);
  } catch (e) { next(e); }
});

// ── Reject / Withdraw application ──────────────────────────────────────────
router.post('/:id/reject', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const app = await db.application.findUnique({ where: { id: req.params.id } });
    if (!app) return res.status(404).json({ error: 'Not found' });

    const [updated] = await db.$transaction([
      db.application.update({
        where: { id: req.params.id },
        data: { stage: 'REJECTED', rejectionReason: reason, isActive: false },
        include: APP_INCLUDE,
      }),
      db.applicationStageHistory.create({
        data: {
          applicationId: req.params.id,
          fromStage: app.stage as any,
          toStage: 'REJECTED',
          changedById: req.user!.id,
          reason,
        },
      }),
    ]);

    res.json(updated);
  } catch (e) { next(e); }
});

// ── Save recruiter screen notes ────────────────────────────────────────────
router.put('/:id/recruiter-screen', async (req, res, next) => {
  try {
    const data = req.body;
    const screen = await db.recruiterScreen.upsert({
      where: { applicationId: req.params.id },
      update: { ...data, screenedById: req.user!.id },
      create: { applicationId: req.params.id, ...data, screenedById: req.user!.id },
    });
    res.json(screen);
  } catch (e) { next(e); }
});

// ── Save HM review ─────────────────────────────────────────────────────────
router.put('/:id/hm-review', async (req, res, next) => {
  try {
    const data = req.body;
    const review = await db.hMReview.upsert({
      where: { applicationId: req.params.id },
      update: { ...data, reviewedById: req.user!.id, reviewedAt: new Date() },
      create: { applicationId: req.params.id, ...data, reviewedById: req.user!.id, reviewedAt: new Date() },
    });
    res.json(review);
  } catch (e) { next(e); }
});

// ── Create / update interview plan ─────────────────────────────────────────
router.put('/:id/interview-plan', async (req, res, next) => {
  try {
    const { totalRounds, rounds } = req.body as { totalRounds: number; rounds: any[] };

    const plan = await db.interviewPlan.upsert({
      where: { applicationId: req.params.id },
      update: { totalRounds, createdById: req.user!.id },
      create: { applicationId: req.params.id, totalRounds, createdById: req.user!.id },
    });

    if (rounds?.length) {
      for (const r of rounds) {
        if (r.id) {
          await db.interviewRound.update({
            where: { id: r.id },
            data: {
              title: r.title,
              scheduledAt: r.scheduledAt ? new Date(r.scheduledAt) : undefined,
              durationMins: r.durationMins,
              mode: r.mode,
              meetLink: r.meetLink,
              interviewerIds: r.interviewerIds ? JSON.stringify(r.interviewerIds) : undefined,
              status: r.status,
            },
          });
        } else {
          await db.interviewRound.create({
            data: {
              planId: plan.id,
              roundNumber: r.roundNumber,
              title: r.title,
              scheduledAt: r.scheduledAt ? new Date(r.scheduledAt) : undefined,
              durationMins: r.durationMins,
              mode: r.mode ?? 'VIDEO',
              meetLink: r.meetLink,
              interviewerIds: r.interviewerIds ? JSON.stringify(r.interviewerIds) : undefined,
            },
          });
        }
      }
    }

    const updated = await db.interviewPlan.findUnique({
      where: { id: plan.id },
      include: { rounds: { include: { feedback: true }, orderBy: { roundNumber: 'asc' } } },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// ── Submit interview feedback ───────────────────────────────────────────────
router.post('/rounds/:roundId/feedback', async (req, res, next) => {
  try {
    const { roundId } = req.params;
    const data = req.body;
    const feedback = await db.interviewFeedback.upsert({
      where: { roundId_interviewerId: { roundId, interviewerId: req.user!.id } },
      update: { ...data, isSubmitted: true, submittedAt: new Date() },
      create: { roundId, interviewerId: req.user!.id, ...data, isSubmitted: true, submittedAt: new Date() },
    });
    res.json(feedback);
  } catch (e) { next(e); }
});

// ── Schedule interview round with Calendar + Email ─────────────────────────
router.post('/:id/schedule-round', async (req, res, next) => {
  try {
    const {
      roundNumber, title, scheduledAt, durationMins = 60,
      mode = 'VIDEO', interviewerIds = [], meetLink: providedMeetLink,
    } = req.body;

    const app = await db.application.findUnique({
      where: { id: req.params.id },
      include: {
        candidate: true,
        requisition: { select: { title: true, reqNumber: true } },
        interviewPlan: { include: { rounds: true } },
      },
    });
    if (!app) return res.status(404).json({ error: 'Application not found' });

    // Ensure plan exists
    const plan = await db.interviewPlan.upsert({
      where: { applicationId: req.params.id },
      update: {},
      create: { applicationId: req.params.id, totalRounds: roundNumber, createdById: req.user!.id },
    });

    // Get interviewers' emails
    const interviewers = interviewerIds.length
      ? await db.user.findMany({ where: { id: { in: interviewerIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
      : [];

    // Create Google Calendar event
    let meetLink = providedMeetLink;
    let calendarEventId: string | undefined;

    if (scheduledAt && mode === 'VIDEO') {
      const attendees = [app.candidate.email, ...interviewers.map((i) => i.email)];
      try {
        const calResult = await createCalendarEvent({
          title: `Interview: ${app.candidate.fullName} — ${app.requisition.title} (${title ?? `Round ${roundNumber}`})`,
          description: `Candidate: ${app.candidate.fullName}\nRole: ${app.requisition.title}\nRound: ${title ?? `Round ${roundNumber}`}`,
          startTime: new Date(scheduledAt),
          durationMins,
          attendeeEmails: attendees,
        });
        calendarEventId = calResult.eventId;
        meetLink = meetLink || calResult.meetLink;
      } catch (err) {
        logger.warn('Calendar event creation failed, continuing without it', { err });
      }
    }

    const round = await db.interviewRound.create({
      data: {
        planId: plan.id,
        roundNumber,
        title: title ?? `Round ${roundNumber}`,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        durationMins,
        mode,
        meetLink,
        calendarEventId,
        interviewerIds: interviewerIds.length ? JSON.stringify(interviewerIds) : undefined,
        status: 'SCHEDULED',
      },
    });

    // Send invite email to candidate
    if (scheduledAt) {
      sendInterviewInvite({
        candidateEmail: app.candidate.email,
        candidateName: app.candidate.fullName,
        role: app.requisition.title,
        company: 'DotPe Private Limited',
        round: title ?? `Round ${roundNumber}`,
        scheduledAt: new Date(scheduledAt),
        durationMins,
        mode,
        meetLink,
        interviewers: interviewers.map((i) => `${i.firstName} ${i.lastName}`).join(', ') || undefined,
      }).catch(() => {});
    }

    res.status(201).json({ round, meetLink, calendarEventId });
  } catch (e) { next(e); }
});

// ── Update interview round status ──────────────────────────────────────────
router.patch('/rounds/:roundId', async (req, res, next) => {
  try {
    const { status, conductedAt, meetLink } = req.body;
    const round = await db.interviewRound.update({
      where: { id: req.params.roundId },
      data: {
        status: status ?? undefined,
        conductedAt: conductedAt ? new Date(conductedAt) : undefined,
        meetLink: meetLink ?? undefined,
      },
    });
    res.json(round);
  } catch (e) { next(e); }
});

// ── Send communication email ───────────────────────────────────────────────
router.post('/:id/send-email', async (req, res, next) => {
  try {
    const { subject, body, type = 'CUSTOM' } = req.body;
    const app = await db.application.findUnique({
      where: { id: req.params.id },
      include: {
        candidate: true,
        requisition: { select: { title: true } },
      },
    });
    if (!app) return res.status(404).json({ error: 'Not found' });

    if (type === 'STAGE_UPDATE') {
      await sendStageUpdate({
        candidateEmail: app.candidate.email,
        candidateName: app.candidate.fullName,
        role: app.requisition.title,
        company: 'DotPe Private Limited',
        stage: app.stage,
        message: body,
      });
    } else {
      await sendCustomEmail({
        to: app.candidate.email,
        subject,
        body,
        candidateName: app.candidate.fullName,
        company: 'DotPe Private Limited',
      });
    }

    // Log communication
    await db.candidateCommunication.create({
      data: {
        applicationId: req.params.id,
        channel: 'EMAIL',
        direction: 'OUTBOUND',
        subject,
        body,
        sentById: req.user!.id,
        sentAt: new Date(),
      },
    });

    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── ATS → Offer bridge: convert application to offer case ─────────────────
router.post('/:id/create-offer', async (req, res, next) => {
  try {
    const app = await db.application.findUnique({
      where: { id: req.params.id },
      include: {
        candidate: true,
        requisition: true,
        recruiterScreen: true,
        hmReview: true,
        interviewPlan: {
          include: {
            rounds: {
              include: {
                feedback: {
                  include: { interviewer: { select: { firstName: true, lastName: true, role: true } } },
                },
              },
              orderBy: { roundNumber: 'asc' },
            },
          },
        },
        stageHistory: {
          include: { changedBy: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!app) return res.status(404).json({ error: 'Not found' });

    // Check no offer already exists for this application
    const existingOffer = await db.offerCase.findFirst({
      where: { sourceApplicationId: app.id },
    });
    if (existingOffer) {
      return res.json({ existing: true, offerCaseId: existingOffer.id });
    }

    // Build interview summary JSON for approval display
    const interviewSummary = {
      recruiterScreen: app.recruiterScreen ? {
        outcome: app.recruiterScreen.outcome,
        salaryExpectation: app.recruiterScreen.salaryExpectation,
        noticePeriodDays: app.recruiterScreen.noticePeriodDays,
        notes: app.recruiterScreen.notes,
      } : null,
      hmReview: app.hmReview ? {
        outcome: app.hmReview.outcome,
        feedback: app.hmReview.feedback,
      } : null,
      rounds: (app.interviewPlan?.rounds ?? []).map((r) => ({
        roundNumber: r.roundNumber,
        title: r.title,
        status: r.status,
        conductedAt: r.conductedAt,
        feedback: r.feedback.map((f) => ({
          interviewer: `${f.interviewer.firstName} ${f.interviewer.lastName}`,
          overallRating: f.overallRating,
          outcome: f.outcome,
          technicalSkills: f.technicalSkills,
          communication: f.communication,
          cultureFit: f.cultureFit,
          problemSolving: f.problemSolving,
          strengths: f.strengths,
          concerns: f.concerns,
          notes: f.notes,
        })),
      })),
      totalRounds: app.interviewPlan?.rounds?.length ?? 0,
      overallRecommendation: deriveOverallRecommendation(app.interviewPlan?.rounds ?? []),
    };

    const count = await db.offerCase.count();
    const offer = await db.offerCase.create({
      data: {
        caseNumber: count + 1,
        candidateId: app.candidateId,
        createdById: req.user!.id,
        recruiterId: app.assignedToId ?? req.user!.id,
        hiringManagerId: app.requisition.hiringManagerId ?? undefined,
        hodId: app.requisition.hodId ?? undefined,
        roleTitle: app.requisition.title,
        department: app.requisition.department,
        jobFamily: app.requisition.subDepartment ?? undefined,
        level: app.requisition.level ?? undefined,
        grade: app.requisition.grade ?? undefined,
        location: app.requisition.location ?? undefined,
        workMode: (app.requisition.workMode as any) ?? 'ONSITE',
        noticePeriodDays: app.recruiterScreen?.noticePeriodDays ?? undefined,
        currentTotalCTC: app.recruiterScreen?.salaryExpectation ?? undefined,
        status: 'DRAFT',
        // ATS bridge
        sourceApplicationId: app.id,
        atsRequisitionId: app.requisitionId,
        interviewSummaryJson: JSON.stringify(interviewSummary),
      },
    });

    // Mark application as OFFER stage
    await db.application.update({
      where: { id: app.id },
      data: { stage: 'OFFER' },
    });

    // Also log stage history
    await db.applicationStageHistory.create({
      data: {
        applicationId: app.id,
        fromStage: app.stage as any,
        toStage: 'OFFER',
        changedById: req.user!.id,
        reason: 'Offer case created',
      },
    });

    res.status(201).json({
      offerCaseId: offer.id,
      caseNumber: offer.caseNumber,
      interviewSummary,
    });
  } catch (e) { next(e); }
});

// ── Get communications log ─────────────────────────────────────────────────
router.get('/:id/communications', async (req, res, next) => {
  try {
    const comms = await db.candidateCommunication.findMany({
      where: { applicationId: req.params.id },
      include: { sentBy: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(comms);
  } catch (e) { next(e); }
});

// ── Helper: derive overall hiring recommendation from all feedback ─────────
function deriveOverallRecommendation(rounds: any[]): string {
  const allFeedback = rounds.flatMap((r) => r.feedback ?? []);
  if (allFeedback.length === 0) return 'NO_FEEDBACK';

  const WEIGHTS: Record<string, number> = { STRONG_YES: 2, YES: 1, NEUTRAL: 0, NO: -1, STRONG_NO: -2 };
  const score = allFeedback.reduce((sum, f) => sum + (WEIGHTS[f.outcome ?? 'NEUTRAL'] ?? 0), 0);
  const avg = score / allFeedback.length;

  if (avg >= 1.5) return 'STRONG_HIRE';
  if (avg >= 0.5) return 'HIRE';
  if (avg >= -0.5) return 'MIXED';
  if (avg >= -1.5) return 'NO_HIRE';
  return 'STRONG_NO_HIRE';
}

export default router;
