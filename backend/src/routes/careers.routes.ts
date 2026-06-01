// Public careers page routes — no auth required
import { Router } from 'express';
import { db } from '../utils/db';
import { sendApplicationReceived } from '../services/email.service';

const router = Router();
const COMPANY = 'DotPe Private Limited';

// ── List open jobs ─────────────────────────────────────────────────────────
router.get('/jobs', async (_req, res, next) => {
  try {
    const jobs = await db.requisition.findMany({
      where: { status: { in: ['APPROVED', 'OPEN'] } },
      select: {
        id: true, reqNumber: true, title: true, department: true,
        subDepartment: true, location: true, workMode: true,
        employmentType: true, level: true, grade: true,
        jdText: true, responsibilities: true, requirements: true,
        budgetedCTCMin: true, budgetedCTCMax: true,
        targetClosureDate: true, createdAt: true,
      },
      orderBy: [{ department: 'asc' }, { createdAt: 'desc' }],
    });
    res.json(jobs);
  } catch (e) { next(e); }
});

// ── Get single job ─────────────────────────────────────────────────────────
router.get('/jobs/:id', async (req, res, next) => {
  try {
    const job = await db.requisition.findFirst({
      where: { id: req.params.id, status: { in: ['APPROVED', 'OPEN'] } },
      select: {
        id: true, reqNumber: true, title: true, department: true,
        subDepartment: true, location: true, workMode: true,
        employmentType: true, level: true, grade: true,
        jdText: true, responsibilities: true, requirements: true,
        targetClosureDate: true, createdAt: true,
      },
    });
    if (!job) return res.status(404).json({ error: 'Job not found or no longer open' });
    res.json(job);
  } catch (e) { next(e); }
});

// ── Submit application ──────────────────────────────────────────────────────
router.post('/apply/:reqId', async (req, res, next) => {
  try {
    const { reqId } = req.params;
    const { fullName, email, phone, coverNote, linkedIn, source = 'PORTAL' } = req.body;

    if (!fullName || !email) return res.status(400).json({ error: 'fullName and email are required' });

    // Verify req is open
    const jobReq = await db.requisition.findFirst({
      where: { id: reqId, status: { in: ['APPROVED', 'OPEN'] } },
    });
    if (!jobReq) return res.status(404).json({ error: 'Job not found or no longer accepting applications' });

    // Upsert candidate
    const candidate = await db.candidate.upsert({
      where: { email: email.toLowerCase().trim() },
      update: { fullName, phone: phone || undefined, linkedIn: linkedIn || undefined },
      create: { fullName, email: email.toLowerCase().trim(), phone: phone || undefined, linkedIn: linkedIn || undefined },
    });

    // Check for duplicate application
    const existing = await db.application.findFirst({
      where: { requisitionId: reqId, candidateId: candidate.id },
    });
    if (existing) {
      return res.status(409).json({ error: 'You have already applied for this position' });
    }

    // Get default recruiter to assign
    const recruiter = await db.user.findFirst({ where: { role: { in: ['RECRUITER', 'TA_MANAGER'] } } });

    const app = await db.application.create({
      data: {
        requisitionId: reqId,
        candidateId: candidate.id,
        source,
        assignedToId: recruiter?.id ?? jobReq.createdById,
        stage: 'APPLIED',
      },
    });

    // Log initial stage history
    await db.applicationStageHistory.create({
      data: {
        applicationId: app.id,
        toStage: 'APPLIED',
        changedById: jobReq.createdById,
        reason: 'Applied via careers page',
      },
    });

    // Save cover note as communication if provided
    if (coverNote) {
      await db.candidateCommunication.create({
        data: {
          applicationId: app.id,
          channel: 'EMAIL',
          direction: 'INBOUND',
          subject: 'Cover Note',
          body: coverNote,
        },
      });
    }

    // Send confirmation email (non-blocking)
    sendApplicationReceived({
      candidateEmail: candidate.email,
      candidateName: candidate.fullName,
      role: jobReq.title,
      company: COMPANY,
      reqNumber: jobReq.reqNumber,
    }).catch(() => {});

    res.status(201).json({ success: true, applicationId: app.id });
  } catch (e) { next(e); }
});

export default router;
