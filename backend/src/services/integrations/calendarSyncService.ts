/**
 * Calendar Sync Service — push app viewings/appointments to a user's connected Google
 * Calendar or Outlook (Microsoft 365). BYO-user: tokens in user_integrations under provider
 * 'google_calendar' | 'outlook' (Outlook's connection carries Calendars.ReadWrite). Uses the
 * connector's auto-refreshed access token. One-way push (app → calendar) for now.
 *
 * @module services/integrations/calendarSyncService
 */

import { integrationConnectorService } from './integrationConnectorService';
import { pool } from '../../database';
import { logger } from '../../utils/logger';

export type CalendarProvider = 'google_calendar' | 'outlook';

export interface CalendarEventInput {
  title: string;
  description?: string;
  location?: string;
  start: string;            // ISO 8601
  end: string;              // ISO 8601
  timeZone?: string;        // IANA, default Africa/Accra (Ghana)
  attendees?: string[];     // emails
}

export interface CalendarPushResult { id: string; url: string | null; provider: CalendarProvider }

const DEFAULT_TZ = 'Africa/Accra';

// ── Google Calendar ───────────────────────────────────────────────────────────
async function pushGoogle(token: string, ev: CalendarEventInput): Promise<CalendarPushResult> {
  const tz = ev.timeZone || DEFAULT_TZ;
  const body = {
    summary: ev.title,
    description: ev.description,
    location: ev.location,
    start: { dateTime: ev.start, timeZone: tz },
    end: { dateTime: ev.end, timeZone: tz },
    attendees: (ev.attendees || []).map((email) => ({ email })),
  };
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `Google Calendar event failed (${res.status})`);
  return { id: j.id, url: j.htmlLink || null, provider: 'google_calendar' };
}

async function testGoogle(token: string): Promise<{ ok: boolean; detail: string }> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', { headers: { Authorization: `Bearer ${token}` } });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `Google Calendar test failed (${res.status})`);
  return { ok: true, detail: `Google Calendar (${j.summary || j.id || 'primary'})` };
}

// ── Outlook (Microsoft Graph) ─────────────────────────────────────────────────
async function pushOutlook(token: string, ev: CalendarEventInput): Promise<CalendarPushResult> {
  const tz = ev.timeZone || DEFAULT_TZ;
  const body = {
    subject: ev.title,
    body: ev.description ? { contentType: 'text', content: ev.description } : undefined,
    location: ev.location ? { displayName: ev.location } : undefined,
    start: { dateTime: ev.start, timeZone: tz },
    end: { dateTime: ev.end, timeZone: tz },
    attendees: (ev.attendees || []).map((email) => ({ emailAddress: { address: email }, type: 'required' })),
  };
  const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `Outlook event failed (${res.status})`);
  return { id: j.id, url: j.webLink || null, provider: 'outlook' };
}

async function testOutlook(token: string): Promise<{ ok: boolean; detail: string }> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me/calendar?$select=name', { headers: { Authorization: `Bearer ${token}` } });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `Outlook calendar test failed (${res.status})`);
  return { ok: true, detail: `Outlook Calendar (${j.name || 'default'})` };
}

// ── Public API ────────────────────────────────────────────────────────────────
export const calendarSyncService = {
  /** Create an event in the user's connected calendar. */
  async pushEvent(userId: string, provider: CalendarProvider, event: CalendarEventInput): Promise<CalendarPushResult> {
    const token = await integrationConnectorService.getValidUserToken(userId, provider);
    const result = provider === 'google_calendar' ? await pushGoogle(token, event) : await pushOutlook(token, event);
    logger.info('Event pushed to connected calendar', { userId, provider, id: result.id });
    return result;
  },

  /** Verify the calendar connection (used by /org-integrations/:type/test). */
  async testConnection(userId: string, provider: CalendarProvider): Promise<{ ok: boolean; detail: string }> {
    const token = await integrationConnectorService.getValidUserToken(userId, provider);
    return provider === 'google_calendar' ? testGoogle(token) : testOutlook(token);
  },

  /** Which calendar (if any) this user connected — for auto-push on scheduling. */
  async getConnectedCalendarProvider(userId: string): Promise<CalendarProvider | null> {
    const r = await pool.query(
      `SELECT provider FROM user_integrations WHERE user_id = $1 AND provider IN ('google_calendar','outlook') ORDER BY updated_at DESC LIMIT 1`,
      [userId]
    );
    return (r.rows[0]?.provider as CalendarProvider) || null;
  },

  /** Best-effort: push an event to whatever calendar the user has connected (no-op if none). */
  async autoPush(userId: string, event: CalendarEventInput): Promise<CalendarPushResult | null> {
    const provider = await this.getConnectedCalendarProvider(userId);
    if (!provider) return null;
    try {
      return await this.pushEvent(userId, provider, event);
    } catch (e: any) {
      logger.warn('Calendar auto-push failed', { userId, provider, error: e?.message });
      return null;
    }
  },
};
