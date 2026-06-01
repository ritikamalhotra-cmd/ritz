// Background scheduler
// • Offer-tool sheet sync   — 11:59 PM IST (nightly)
// • ATS sourcing sheet sync — on startup + every 2 hours during the day

import { syncFromSheet }    from '../services/sheets.service';
import { syncFromAtsSheet } from '../services/ats-sheets.service';
import { logger }           from '../utils/logger';

// ── helpers ─────────────────────────────────────────────────────────────────

function msUntilNextRun(hour: number, minute: number): number {
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + IST_OFFSET);
  const next   = new Date(nowIST);
  next.setHours(hour, minute, 0, 0);
  if (next <= nowIST) next.setDate(next.getDate() + 1);
  return next.getTime() - nowIST.getTime();
}

async function runAtsSync(label: string) {
  try {
    logger.info(`ATS sheet sync starting (${label})…`);
    const result = await syncFromAtsSheet();
    logger.info(`ATS sheet sync done (${label})`, result);
  } catch (err) {
    logger.error(`ATS sheet sync failed (${label})`, { err });
  }
}

// ── nightly offer-tool sheet sync ────────────────────────────────────────────

function scheduleNightlyOfferSync() {
  const delay = msUntilNextRun(23, 59); // 11:59 PM IST
  logger.info(
    `Next offer-sheet sync at ${new Date(Date.now() + delay).toISOString()} ` +
    `(in ${Math.round(delay / 60000)} min)`,
  );
  setTimeout(async () => {
    try {
      logger.info('Running nightly offer Google Sheets sync…');
      const result = await syncFromSheet();
      logger.info('Offer sheet sync complete', result);
    } catch (err) {
      logger.error('Offer sheet sync failed', { err });
    } finally {
      scheduleNightlyOfferSync();
    }
  }, delay);
}

// ── ATS sheet sync — every 2 hours ──────────────────────────────────────────

const ATS_SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

function scheduleRecurringAtsSync() {
  setTimeout(async () => {
    await runAtsSync('scheduled');
    scheduleRecurringAtsSync(); // reschedule after each run
  }, ATS_SYNC_INTERVAL_MS);
}

// ── entry point ──────────────────────────────────────────────────────────────

export function startScheduler(): void {
  if (process.env.NODE_ENV === 'test') return;

  // Nightly offer-tool sync
  scheduleNightlyOfferSync();

  // ATS sync: run once on startup (after a short delay) then every 2 hours
  setTimeout(() => runAtsSync('startup'), 10_000);
  scheduleRecurringAtsSync();
}
