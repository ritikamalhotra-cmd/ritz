// Google Sheets sync service
// Reads the candidate tracker sheet and creates draft offers for new entries

import { db } from '../utils/db';
import { logger } from '../utils/logger';

const SHEET_ID = '15I9HMa5TIC-ov8-PejOZgVWuDMQIuo0LpJYgxsM4XjI';
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

interface SheetRow {
  candidateName: string;
  emailId: string;
  contactNo: string;
  role: string;
  address: string;
  department: string;
  subDepartment: string;
  buHeadName: string;
  currentCTC: number;
  offeredCTC: number;
  doj: string;
  designation: string;
  joiningBonus: number;
  noticePeriodDays: number;
}

function parseINR(val: string): number {
  if (!val) return 0;
  // Handle formats like "12,00,000" or "1200000" or "12L" or "12 LPA"
  const cleaned = val.replace(/[₹,\s]/g, '').toLowerCase();
  if (cleaned.includes('l')) return parseFloat(cleaned) * 100000;
  if (cleaned.includes('k')) return parseFloat(cleaned) * 1000;
  return parseFloat(cleaned) || 0;
}

function parseDate(val: string): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

async function fetchSheetRows(): Promise<SheetRow[]> {
  // Fetch CSV — follow redirects (Google Sheets redirects to googleusercontent.com)
  let response = await fetch(SHEET_CSV_URL, { redirect: 'follow' });

  // Manually follow redirect if needed
  if (response.status === 307 || response.status === 302 || response.status === 301) {
    const location = response.headers.get('location');
    if (location) {
      response = await fetch(location, { redirect: 'follow' });
    }
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch sheet: ${response.status} ${response.statusText}. Make sure the sheet is set to "Anyone with the link can view".`);
  }
  const text = await response.text();
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  // Skip header row (index 0)
  const rows: SheetRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (!cols[0]?.trim() || !cols[1]?.trim()) continue; // skip empty rows

    rows.push({
      candidateName:    cols[0]?.trim() || '',
      emailId:          cols[1]?.trim().toLowerCase() || '',
      contactNo:        cols[2]?.trim() || '',
      role:             cols[3]?.trim() || '',
      address:          cols[4]?.trim() || '',
      department:       cols[5]?.trim() || '',
      subDepartment:    cols[6]?.trim() || '',
      buHeadName:       cols[7]?.trim() || '',
      currentCTC:       parseINR(cols[8] || ''),
      offeredCTC:       parseINR(cols[9] || ''),
      doj:              cols[10]?.trim() || '',
      designation:      cols[11]?.trim() || '',
      joiningBonus:     parseINR(cols[12] || ''),
      noticePeriodDays: parseInt(cols[13] || '0') || 0,
    });
  }
  return rows;
}

// Simple CSV line parser handling quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export interface SyncResult {
  total: number;
  created: number;
  skipped: number;
  errors: string[];
}

export async function syncFromSheet(): Promise<SyncResult> {
  logger.info('Starting Google Sheets sync...');
  const result: SyncResult = { total: 0, created: 0, skipped: 0, errors: [] };

  let rows: SheetRow[];
  try {
    rows = await fetchSheetRows();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to fetch sheet', { err });
    result.errors.push(`Fetch failed: ${msg}`);
    return result;
  }

  result.total = rows.length;
  logger.info(`Fetched ${rows.length} rows from sheet`);

  // Get a system user to assign as createdBy (first ADMIN or SUPER_ADMIN)
  const systemUser = await db.user.findFirst({
    where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } },
  });
  if (!systemUser) {
    result.errors.push('No admin user found to assign as creator');
    return result;
  }

  // Find default TA_MANAGER to assign as SPOC
  const defaultTA = await db.user.findFirst({ where: { role: 'TA_MANAGER' } });

  for (const row of rows) {
    try {
      if (!row.emailId || !row.candidateName) {
        result.skipped++;
        continue;
      }

      // Always update candidate details (address etc.) even if offer already exists
      const existingCandidate = await db.candidate.findUnique({ where: { email: row.emailId } });
      if (existingCandidate) {
        await db.candidate.update({
          where: { email: row.emailId },
          data: {
            fullName: row.candidateName,
            phone:    row.contactNo || undefined,
            address:  row.address   || undefined,
          },
        });
        const existingOffer = await db.offerCase.findFirst({
          where: { candidateId: existingCandidate.id },
        });
        if (existingOffer) {
          result.skipped++;
          logger.info(`Skipping offer creation for existing candidate: ${row.emailId}`);
          continue;
        }
      }

      // Upsert candidate
      const candidate = await db.candidate.upsert({
        where: { email: row.emailId },
        update: {
          fullName: row.candidateName,
          phone:    row.contactNo || undefined,
          address:  row.address   || undefined,
        },
        create: {
          fullName: row.candidateName,
          email:    row.emailId,
          phone:    row.contactNo || undefined,
          address:  row.address   || undefined,
        },
      });

      // Get count for case number
      const count = await db.offerCase.count();

      // Create draft offer
      await db.offerCase.create({
        data: {
          caseNumber: count + 1,
          candidateId: candidate.id,
          createdById: systemUser.id,
          recruiterId: defaultTA?.id || systemUser.id,
          roleTitle: row.designation || row.role || 'TBD',
          department: row.department || 'TBD',
          jobFamily: row.subDepartment || undefined,
          currentTotalCTC: row.currentCTC || undefined,
          noticePeriodDays: row.noticePeriodDays || undefined,
          status: 'DRAFT',
          preferredDOJ: parseDate(row.doj) || undefined,
          compensationProposal: row.offeredCTC > 0 ? {
            create: {
              proposedFixed: row.offeredCTC,
              proposedTotalCash: row.offeredCTC,
              proposedTotalCTC: row.offeredCTC,
              joiningBonus: row.joiningBonus || 0,
            },
          } : undefined,
        },
      });

      result.created++;
      logger.info(`Created draft offer for ${row.candidateName} (${row.emailId})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Error processing row for ${row.emailId}`, { err });
      result.errors.push(`${row.emailId}: ${msg}`);
    }
  }

  logger.info('Sheet sync complete', { ...result });
  return result;
}
