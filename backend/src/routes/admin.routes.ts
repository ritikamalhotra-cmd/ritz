import { Router, Request, Response } from 'express';
import { db } from '../utils/db';
import { hashPassword } from '../utils/crypto';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { syncFromSheet } from '../services/sheets.service';
import { syncFromAtsSheet } from '../services/ats-sheets.service';
import { z } from 'zod';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);
router.use(authorize('ADMIN', 'SUPER_ADMIN'));

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['ADMIN', 'TA_MANAGER', 'BU_HEAD', 'HR_HEAD', 'VIEWER', 'RECRUITER', 'HOD', 'HRBP', 'COMP_FINANCE', 'ONBOARDING_SPOC']),
  department: z.string().optional(),
});

const updateUserSchema = z.object({
  role: z.enum(['ADMIN', 'TA_MANAGER', 'BU_HEAD', 'HR_HEAD', 'VIEWER', 'RECRUITER', 'HOD', 'HRBP', 'COMP_FINANCE', 'ONBOARDING_SPOC']).optional(),
  department: z.string().optional(),
  isActive: z.boolean().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

// ── Users ──

// GET /api/admin/users
router.get('/users', async (_req: Request, res: Response) => {
  try {
    const users = await db.user.findMany({
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, department: true, isActive: true, createdAt: true, lastLoginAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ users });
  } catch (err) {
    logger.error('List users error', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/users
router.post('/users', validate(createUserSchema), async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, role, department } = req.body;
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) { res.status(409).json({ error: 'Email already exists' }); return; }

    const passwordHash = await hashPassword(password);
    const user = await db.user.create({
      data: { email, passwordHash, firstName, lastName, role, department },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, department: true },
    });
    res.status(201).json({ user });
  } catch (err) {
    logger.error('Create user error', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/users/:id
router.patch('/users/:id', validate(updateUserSchema), async (req: Request, res: Response) => {
  try {
    const user = await db.user.update({
      where: { id: req.params.id },
      data: req.body,
      select: { id: true, email: true, firstName: true, lastName: true, role: true, department: true, isActive: true },
    });
    res.json({ user });
  } catch {
    res.status(404).json({ error: 'User not found' });
  }
});

// DELETE /api/admin/users/:id (deactivate, not hard delete)
router.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    await db.user.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'User not found' });
  }
});

// ── Google Sheets sync ──

// POST /api/admin/sync-sheet — manual trigger
router.post('/sync-sheet', async (_req: Request, res: Response) => {
  try {
    const result = await syncFromSheet();
    res.json({ ok: true, result });
  } catch (err) {
    logger.error('Manual sync error', { err });
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/admin/sheet-ping — diagnose sheet accessibility
router.get('/sheet-ping', async (_req: Request, res: Response) => {
  const SHEET_ID = '15I9HMa5TIC-ov8-PejOZgVWuDMQIuo0LpJYgxsM4XjI';
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
  try {
    let response = await fetch(url, { redirect: 'follow' });
    if ([301, 302, 307].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) response = await fetch(location, { redirect: 'follow' });
    }
    const text = await response.text();
    const lines = text.trim().split('\n');
    res.json({
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get('content-type'),
      rowCount: lines.length,
      preview: lines.slice(0, 3),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/admin/sync-ats-sheet — sync candidates from ATS sourcing tracker
router.post('/sync-ats-sheet', async (_req: Request, res: Response) => {
  try {
    const result = await syncFromAtsSheet();
    res.json({ ok: true, result });
  } catch (err) {
    logger.error('ATS sheet sync error', { err });
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/admin/audit-logs
router.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = 50;
    const logs = await db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
    res.json({ logs });
  } catch (err) {
    logger.error('Audit log error', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
