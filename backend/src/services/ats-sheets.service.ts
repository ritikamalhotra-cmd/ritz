// ATS Google Sheets sync — reads sourcing tracker sheet and creates Applications
// Sheet format (row 1 = headers):
//   A: Candidate Name | B: Email ID | C: Contact No | D: LinkedIn URL
//   E: Source         | F: Requisition No (number, e.g. 6) | G: Department
//   H: Current CTC (₹) | I: Expected CTC (₹) | J: Notice Period (days) | K: Notes

import { db } from '../utils/db';
import { logger } from '../utils/logger';

const SHEET_ID = process.env.SHEETS_ATS_ID || '15I9HMa5TIC-ov8-PejOZgVWuDMQIuo0LpJYgxsM4XjI';
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

interface AtsSheetRow {
  candidateName:    string;
  email:            string;
  phone:            string;
  linkedIn:         string;
  source:           string;
  requisitionNo:    string;   // raw value from col F
  department:       string;
  currentCTC:       number;
  expectedCTC:      number;
  noticePeriodDays: number;
  notes:            string;
}

function parseINR(val: string): number {
  if (!val) return 0;
  const cleaned = val.replace(/[₹,\s]/g, '').toLowerCase();
  if (cleaned.includes('l')) return parseFloat(cleaned) * 100000;
  if (cleaned.includes('k')) return parseFloat(cleaned) * 1000;
  return parseFloat(cleaned) || 0;
}

function normaliseSource(raw: string): string {
  if (!raw) return 'MANUAL';
  const up = raw.trim().toUpperCase().replace(/\s+/g, '_');
  const MAP: Record<string, string> = {
    REFERRAL:   'REFERRAL',
    REFERENCE:  'REFERRAL',
    REFERENCES: 'REFERRAL',
    NAUKRI:     'JOB_PORTAL',
    PORTAL:     'JOB_PORTAL',
    JOB_PORTAL: 'JOB_PORTAL',
    LINKEDIN:   'LINKEDIN',
    CAMPUS:     'CAMPUS',
    INTERNAL:   'INTERNAL',
    VENDOR:     'VENDOR',
    HEADHUNTING:'HEADHUNTING',
    HUNTING:    'HEADHUNTING',
  };
  return MAP[up] ?? up;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

async function fetchSheetRows(): Promise<AtsSheetRow[]> {
  let response = await fetch(SHEET_CSV_URL, { redirect: 'follow' });
  if (response.status === 307 || response.status === 302 || response.status === 301) {
    const loc = response.headers.get('location');
    if (loc) response = await fetch(loc, { redirect: 'follow' });
  }
  if (!response.ok) throw new Error(`Sheet fetch failed: ${response.status} ${response.statusText}`);

  const text = await response.text();
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const rows: AtsSheetRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCSVLine(lines[i]);
    const name  = c[0]?.trim() || '';
    const email = c[1]?.trim().toLowerCase() || '';
    if (!name || !email) continue;

    rows.push({
      candidateName:    name,
      email,
      phone:            c[2]?.trim() || '',
      linkedIn:         c[3]?.trim() || '',
      source:           normaliseSource(c[4] || ''),
      requisitionNo:    c[5]?.trim() || '',
      department:       c[6]?.trim() || '',
      currentCTC:       parseINR(c[7] || ''),
      expectedCTC:      parseINR(c[8] || ''),
      noticePeriodDays: parseInt(c[9] || '0') || 0,
      notes:            c[10]?.trim() || '',
    });
  }
  return rows;
}

export interface AtsSyncResult {
  total:   number;
  created: number;
  skipped: number;
  errors:  string[];
  skippedDetails?: string[];
}

export async function syncFromAtsSheet(): Promise<AtsSyncResult> {
  logger.info('Starting ATS sheet sync…');
  const result: AtsSyncResult = { total: 0, created: 0, skipped: 0, errors: [], skippedDetails: [] };

  let rows: AtsSheetRow[];
  try {
    rows = await fetchSheetRows();
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    return result;
  }

  result.total = rows.length;

  const recruiter = await db.user.findFirst({ where: { role: { in: ['RECRUITER', 'TA_MANAGER'] } } });
  const fallback  = await db.user.findFirst({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } } });
  const assignTo  = recruiter ?? fallback;
  if (!assignTo) { result.errors.push('No recruiter/admin user found'); return result; }

  for (const row of rows) {
    try {
      // ── Resolve requisition ────────────────────────────────────────────
      let requisition: any = null;

      // Strategy 1: match by requisition number from col F
      if (row.requisitionNo) {
        const num = parseInt(row.requisitionNo.replace(/\D/g, '')) || null;
        if (num) {
          requisition = await db.requisition.findFirst({
            where: { reqNumber: num, status: { in: ['APPROVED', 'OPEN'] } },
          });
        }
      }

      // Strategy 2: match by department name
      if (!requisition && row.department) {
        requisition = await db.requisition.findFirst({
          where: {
            department: row.department,
            status: { in: ['APPROVED', 'OPEN'] },
          },
          orderBy: { createdAt: 'desc' },
        });
      }

      if (!requisition) {
        const reason = `no open req for dept="${row.department}" or reqNo="${row.requisitionNo}"`;
        logger.info(`Skipping ${row.email}: ${reason}`);
        result.skippedDetails!.push(`${row.candidateName} (${row.email}): ${reason}`);
        result.skipped++;
        continue;
      }

      // ── Upsert candidate ───────────────────────────────────────────────
      const candidate = await db.candidate.upsert({
        where:  { email: row.email },
        update: { fullName: row.candidateName, phone: row.phone || undefined, linkedIn: row.linkedIn || undefined },
        create: { fullName: row.candidateName, email: row.email, phone: row.phone || undefined, linkedIn: row.linkedIn || undefined },
      });

      // ── Skip duplicate application ─────────────────────────────────────
      const existing = await db.application.findFirst({
        where: { requisitionId: requisition.id, candidateId: candidate.id },
      });
      if (existing) {
        result.skippedDetails!.push(`${row.candidateName}: already has application for ${requisition.title}`);
        result.skipped++;
        continue;
      }

      // ── Create application ─────────────────────────────────────────────
      const app = await db.application.create({
        data: {
          requisitionId: requisition.id,
          candidateId:   candidate.id,
          source:        row.source || 'MANUAL',
          assignedToId:  assignTo.id,
          stage:         'APPLIED',
        },
      });

      await db.applicationStageHistory.create({
        data: { applicationId: app.id, toStage: 'APPLIED', changedById: assignTo.id, reason: 'Synced from ATS sheet' },
      });

      if (row.expectedCTC || row.noticePeriodDays || row.notes) {
        await db.recruiterScreen.upsert({
          where:  { applicationId: app.id },
          update: {},
          create: {
            applicationId:    app.id,
            salaryExpectation: row.expectedCTC || undefined,
            noticePeriodDays:  row.noticePeriodDays || undefined,
            notes:             row.notes || undefined,
            screenedById:      assignTo.id,
          },
        });
      }

      result.created++;
      logger.info(`Created application for ${row.candidateName} → ${requisition.title}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`ATS sync error for ${row.email}`, { err });
      result.errors.push(`${row.email}: ${msg}`);
    }
  }

  logger.info('ATS sheet sync complete', { ...result });
  return result;
}
