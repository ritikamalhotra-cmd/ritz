// Google Calendar integration
// Requires env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_CALENDAR_ID
// If not configured, returns a stub response (no event created)

import { google } from 'googleapis';
import { logger } from '../utils/logger';

const CLIENT_ID      = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET  = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN  = process.env.GOOGLE_REFRESH_TOKEN;
const CALENDAR_ID    = process.env.GOOGLE_CALENDAR_ID || 'primary';

function isConfigured(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);
}

function getCalendar() {
  const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  auth.setCredentials({ refresh_token: REFRESH_TOKEN });
  return google.calendar({ version: 'v3', auth });
}

export interface CalendarEventInput {
  title: string;
  description?: string;
  startTime: Date;
  durationMins: number;
  attendeeEmails: string[];
  meetLink?: string; // If provided, use it; else create Google Meet
}

export interface CalendarEventResult {
  eventId: string;
  meetLink?: string;
  htmlLink?: string;
}

export async function createCalendarEvent(input: CalendarEventInput): Promise<CalendarEventResult> {
  if (!isConfigured()) {
    logger.info('Google Calendar not configured — skipping event creation', { title: input.title });
    return { eventId: `stub_${Date.now()}` };
  }

  const calendar = getCalendar();
  const end = new Date(input.startTime.getTime() + input.durationMins * 60_000);

  const event: any = {
    summary: input.title,
    description: input.description,
    start: { dateTime: input.startTime.toISOString(), timeZone: 'Asia/Kolkata' },
    end:   { dateTime: end.toISOString(),              timeZone: 'Asia/Kolkata' },
    attendees: input.attendeeEmails.map((email) => ({ email })),
    conferenceData: {
      createRequest: {
        requestId: `meet_${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email',  minutes: 1440 }, // 24h
        { method: 'popup',  minutes: 30  },
      ],
    },
  };

  try {
    const res = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      conferenceDataVersion: 1,
      sendNotifications: true,
      requestBody: event,
    });

    return {
      eventId:  res.data.id!,
      meetLink: res.data.conferenceData?.entryPoints?.[0]?.uri ?? undefined,
      htmlLink: res.data.htmlLink ?? undefined,
    };
  } catch (err) {
    logger.error('Google Calendar event creation failed', { err });
    throw err;
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  if (!isConfigured() || eventId.startsWith('stub_')) return;
  const calendar = getCalendar();
  await calendar.events.delete({ calendarId: CALENDAR_ID, eventId }).catch((e) => {
    logger.warn('Could not delete calendar event', { eventId, err: e });
  });
}
