import helmet from 'helmet';
import cors from 'cors';
import { RequestHandler } from 'express';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Build list of allowed origins — supports exact URL + Vercel preview deployments
function isAllowedOrigin(origin: string | undefined): boolean {
  // Allow requests with no origin (server-to-server, health checks, curl)
  if (!origin) return true;
  if (origin === 'http://localhost:5173') return true;
  if (origin === FRONTEND_URL) return true;
  // Allow all Vercel preview deployments for this project
  if (origin.match(/https:\/\/ritz(-[a-z0-9]+)*-ritikamalhotra-cmds-projects\.vercel\.app$/)) return true;
  if (origin.match(/https:\/\/ritz\.vercel\.app$/)) return true;
  return false;
}

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://accounts.google.com', 'https://apis.google.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://lh3.googleusercontent.com'],
      connectSrc: ["'self'", 'https://accounts.google.com', 'https://oauth2.googleapis.com'],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
});

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin not allowed — ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Portal-Token', 'X-Impersonation-Token'],
});

export const requestSizeLimiter: RequestHandler = (req, res, next) => {
  // Applied via express.json in app setup
  next();
};
