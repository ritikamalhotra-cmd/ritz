import helmet from 'helmet';
import cors from 'cors';
import { RequestHandler } from 'express';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

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
  origin: FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Portal-Token', 'X-Impersonation-Token'],
});

export const requestSizeLimiter: RequestHandler = (req, res, next) => {
  // Applied via express.json in app setup
  next();
};
