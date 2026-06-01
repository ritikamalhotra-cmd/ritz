import express from 'express';
import cookieParser from 'cookie-parser';
import { helmetMiddleware, corsMiddleware } from './middleware/security';
import { csrfProtection } from './middleware/csrf';
import { generalLimiter } from './middleware/rateLimiter';
import authRoutes from './routes/auth.routes';
import googleAuthRoutes from './routes/google-auth.routes';
import offerRoutes from './routes/offer.routes';
import approvalRoutes from './routes/approval.routes';
import candidateAuthRoutes from './routes/candidate-auth.routes';
import offerLetterRoutes from './routes/offerLetter.routes';
import adminRoutes from './routes/admin.routes';
import requisitionRoutes from './routes/requisition.routes';
import applicationRoutes from './routes/application.routes';
import analyticsRoutes from './routes/analytics.routes';
import careersRoutes from './routes/careers.routes';
import { startScheduler } from './workers/scheduler';
import { seedDefaultTemplatesIfMissing } from './services/offerLetter.service';
import { db } from './utils/db';

const app = express();

// ── Middleware (order matters — do not reorder) ──
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(cookieParser());
app.use(csrfProtection);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(generalLimiter);
app.disable('x-powered-by');

// ── Health ──
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── Candidate portal routes must come BEFORE staff offer-letter routes ──
app.use('/api/candidate/portal', candidateAuthRoutes);
app.use('/api/offer-letters/candidate', offerLetterRoutes); // candidate sub-routes handled inside
app.use('/api/offer-letters', offerLetterRoutes);

// ── Staff routes ──
app.use('/api/auth', authRoutes);
app.use('/api/auth/google', googleAuthRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/requisitions', requisitionRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/careers', careersRoutes); // public — no auth middleware

// ── 404 ──
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ──
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export { app };

if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, async () => {
    console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', message: `Server running on :${PORT}` }));
    startScheduler();
    // Seed default offer letter template if not present
    try {
      const admin = await db.user.findFirst({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } } });
      if (admin) await seedDefaultTemplatesIfMissing(admin.id);
    } catch (e) {
      console.error('Template seed failed', e);
    }
  });
}
