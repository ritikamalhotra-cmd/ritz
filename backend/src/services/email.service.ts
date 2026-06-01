// Email service — GSuite SMTP / nodemailer
// Config via env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
// If env not set, logs to console (dev mode)

import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

const SMTP_HOST  = process.env.SMTP_HOST  || '';
const SMTP_PORT  = parseInt(process.env.SMTP_PORT  || '587');
const SMTP_USER  = process.env.SMTP_USER  || '';
const SMTP_PASS  = process.env.SMTP_PASS  || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'OfferOps <noreply@dotpe.in>';
const APP_URL    = process.env.APP_URL    || 'http://localhost:5173';

function getTransport() {
  if (!SMTP_HOST || !SMTP_USER) {
    // Dev: log to console
    return nodemailer.createTransport({ jsonTransport: true });
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function sendMail(opts: { to: string; subject: string; html: string }) {
  const transport = getTransport();
  const info = await transport.sendMail({ from: EMAIL_FROM, ...opts });
  if (!SMTP_HOST) {
    logger.info('DEV EMAIL (not sent):', { to: opts.to, subject: opts.subject });
  }
  return info;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function sendInterviewInvite(opts: {
  candidateEmail: string;
  candidateName: string;
  role: string;
  company: string;
  round: string;
  scheduledAt: Date;
  durationMins: number;
  mode: string;
  meetLink?: string;
  interviewers?: string;
}) {
  const dateStr = opts.scheduledAt.toLocaleString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#e31837;padding:24px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">Interview Invitation</h2>
      </div>
      <div style="padding:24px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">
        <p>Dear ${opts.candidateName},</p>
        <p>We are pleased to invite you for an interview for the <strong>${opts.role}</strong> position at <strong>${opts.company}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
          <tr><td style="padding:8px;background:#f9f9f9;font-weight:bold;width:40%">Round</td><td style="padding:8px">${opts.round}</td></tr>
          <tr><td style="padding:8px;background:#f9f9f9;font-weight:bold">Date &amp; Time</td><td style="padding:8px">${dateStr} IST</td></tr>
          <tr><td style="padding:8px;background:#f9f9f9;font-weight:bold">Duration</td><td style="padding:8px">${opts.durationMins} minutes</td></tr>
          <tr><td style="padding:8px;background:#f9f9f9;font-weight:bold">Mode</td><td style="padding:8px">${opts.mode === 'VIDEO' ? 'Video Call' : opts.mode === 'IN_PERSON' ? 'In Person' : 'Phone Call'}</td></tr>
          ${opts.meetLink ? `<tr><td style="padding:8px;background:#f9f9f9;font-weight:bold">Join Link</td><td style="padding:8px"><a href="${opts.meetLink}" style="color:#e31837">${opts.meetLink}</a></td></tr>` : ''}
          ${opts.interviewers ? `<tr><td style="padding:8px;background:#f9f9f9;font-weight:bold">Interviewer(s)</td><td style="padding:8px">${opts.interviewers}</td></tr>` : ''}
        </table>
        <p>Please confirm your availability by replying to this email.</p>
        <p>Best regards,<br/>Talent Acquisition Team<br/>${opts.company}</p>
      </div>
    </div>
  `;

  return sendMail({ to: opts.candidateEmail, subject: `Interview Invitation — ${opts.role} at ${opts.company}`, html });
}

export async function sendApplicationReceived(opts: {
  candidateEmail: string;
  candidateName: string;
  role: string;
  company: string;
  reqNumber: number;
}) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#e31837;padding:24px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">Application Received</h2>
      </div>
      <div style="padding:24px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">
        <p>Dear ${opts.candidateName},</p>
        <p>Thank you for applying for the <strong>${opts.role}</strong> position at <strong>${opts.company}</strong>.</p>
        <p>Your application (Ref: <strong>REQ-${String(opts.reqNumber).padStart(4, '0')}</strong>) has been received and is under review.</p>
        <p>We will be in touch with the next steps shortly.</p>
        <p>Best regards,<br/>Talent Acquisition Team<br/>${opts.company}</p>
      </div>
    </div>
  `;
  return sendMail({ to: opts.candidateEmail, subject: `Application Received — ${opts.role} at ${opts.company}`, html });
}

export async function sendStageUpdate(opts: {
  candidateEmail: string;
  candidateName: string;
  role: string;
  company: string;
  stage: string;
  message?: string;
}) {
  const STAGE_MESSAGES: Record<string, string> = {
    SCREENING: 'Your application has moved to the screening stage. Our team will review your profile.',
    RECRUITER_CALL: 'We would like to schedule a call to discuss your application. Our recruiter will reach out to you.',
    HM_REVIEW: 'Your profile is being reviewed by the hiring team.',
    INTERVIEW: 'Congratulations! You have been shortlisted for an interview. You will receive a separate invite.',
    OFFER_DISCUSSION: 'We are pleased with your interviews and would like to move to offer discussions.',
    OFFER: 'We are excited to extend an offer to you. Please check your email for the offer letter.',
    REJECTED: 'Thank you for your interest. After careful consideration, we have decided to move forward with other candidates.',
  };

  const msg = opts.message || STAGE_MESSAGES[opts.stage] || 'Your application status has been updated.';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#e31837;padding:24px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">Application Update — ${opts.role}</h2>
      </div>
      <div style="padding:24px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">
        <p>Dear ${opts.candidateName},</p>
        <p>${msg}</p>
        <p>Best regards,<br/>Talent Acquisition Team<br/>${opts.company}</p>
      </div>
    </div>
  `;
  return sendMail({ to: opts.candidateEmail, subject: `Application Update — ${opts.role} at ${opts.company}`, html });
}

export async function sendCustomEmail(opts: {
  to: string;
  subject: string;
  body: string;
  candidateName: string;
  company: string;
}) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#e31837;padding:24px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">${opts.company}</h2>
      </div>
      <div style="padding:24px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">
        <p>Dear ${opts.candidateName},</p>
        <div style="white-space:pre-wrap">${opts.body}</div>
        <p>Best regards,<br/>Talent Acquisition Team<br/>${opts.company}</p>
      </div>
    </div>
  `;
  return sendMail({ to: opts.to, subject: opts.subject, html });
}
