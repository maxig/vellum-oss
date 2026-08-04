// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * CalDAV integration — Apple iCloud, Fastmail, Nextcloud, Posteo,
 * mailcow, Radicale, Baikal, etc.
 *
 * CALENDAR_FEATURE.md §8. Uses `tsdav` for the protocol. The candidate
 * invite is delivered via Vellum's normal SMTP path (CalDAV servers
 * don't reliably do iTIP) — we just PUT the ICS to the user's
 * collection so the meeting appears in their own calendar.
 *
 * CalDAV has no OAuth — accounts are username + password (typically an
 * app-specific password). The password is encrypted at rest with the
 * same KMS path as EmailAccount.
 */

import {
  createDAVClient,
  type DAVCalendar,
  type DAVCalendarObject,
} from "tsdav";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { buildIcs } from "@/lib/calendar";
import { logger } from "@/lib/log";

const log = logger("caldav");

type Probe = {
  serverUrl: string;
  username: string;
  password: string;
};

export async function probeAccount(input: Probe): Promise<{ calendars: { url: string; displayName: string }[] }> {
  const client = await createDAVClient({
    serverUrl: input.serverUrl,
    credentials: { username: input.username, password: input.password },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });
  const cals = await client.fetchCalendars();
  const writable = (cals as DAVCalendar[])
    .filter((c) => !c.components || c.components.includes("VEVENT"))
    .map((c) => ({ url: c.url, displayName: (c.displayName as string) || c.url }));
  return { calendars: writable };
}

async function clientFor(accountId: string) {
  const account = await db.calendarAccount.findUnique({ where: { id: accountId } });
  if (!account || account.provider !== "caldav") throw new Error("not a CalDAV account");
  if (!account.serverUrl) throw new Error("CalDAV account missing serverUrl");
  if (!account.passwordEnc) throw new Error("CalDAV account missing password");
  const password = decryptSecret(account.passwordEnc);
  const client = await createDAVClient({
    serverUrl: account.serverUrl,
    credentials: { username: account.email, password },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });
  return { account, client };
}

export async function pushInterview(
  accountId: string,
  payload: {
    interviewId: string;
    summary: string;
    description: string;
    startsAt: Date;
    durationMin: number;
    location?: string | null;
    meetingUrl?: string | null;
    organizer: { name: string; email: string };
    attendees: { email: string; name?: string }[];
    sequence?: number;
  },
): Promise<{ externalEventId: string }> {
  const { account, client } = await clientFor(accountId);
  if (!account.defaultCalendarUrl) throw new Error("CalDAV account missing default calendar");

  const uid = `${payload.interviewId}@vellum`;
  const ics = buildIcs({
    uid,
    start: payload.startsAt,
    durationMinutes: payload.durationMin,
    summary: payload.summary,
    description: payload.description,
    location: payload.location || undefined,
    url: payload.meetingUrl || undefined,
    organizer: payload.organizer,
    attendees: payload.attendees.map((a) => ({ name: a.name || a.email, email: a.email })),
    sequence: payload.sequence || 0,
    method: "REQUEST",
  });

  const filename = `${payload.interviewId}.ics`;
  await client.createCalendarObject({
    calendar: { url: account.defaultCalendarUrl } as DAVCalendar,
    filename,
    iCalString: ics,
  });
  return { externalEventId: filename };
}

export async function patchInterview(
  accountId: string,
  externalEventId: string,
  payload: Parameters<typeof pushInterview>[1],
) {
  const { account, client } = await clientFor(accountId);
  if (!account.defaultCalendarUrl) throw new Error("CalDAV account missing default calendar");
  const uid = `${payload.interviewId}@vellum`;
  const ics = buildIcs({
    uid,
    start: payload.startsAt,
    durationMinutes: payload.durationMin,
    summary: payload.summary,
    description: payload.description,
    location: payload.location || undefined,
    url: payload.meetingUrl || undefined,
    organizer: payload.organizer,
    attendees: payload.attendees.map((a) => ({ name: a.name || a.email, email: a.email })),
    sequence: (payload.sequence || 0) + 1,
    method: "REQUEST",
  });

  // Fetch the existing object first to get its etag for the update.
  const existing = (await client.fetchCalendarObjects({
    calendar: { url: account.defaultCalendarUrl } as DAVCalendar,
  })) as DAVCalendarObject[];
  const found = existing.find((o) => o.url.endsWith(externalEventId));
  if (!found) {
    // Object disappeared — treat as a fresh push so the user's calendar reflects truth.
    await client.createCalendarObject({
      calendar: { url: account.defaultCalendarUrl } as DAVCalendar,
      filename: externalEventId,
      iCalString: ics,
    });
    return;
  }
  await client.updateCalendarObject({ calendarObject: { ...found, data: ics } });
}

export async function cancelInterview(accountId: string, externalEventId: string) {
  const { account, client } = await clientFor(accountId);
  if (!account.defaultCalendarUrl) return;
  const existing = (await client.fetchCalendarObjects({
    calendar: { url: account.defaultCalendarUrl } as DAVCalendar,
  })) as DAVCalendarObject[];
  const found = existing.find((o) => o.url.endsWith(externalEventId));
  if (!found) return;
  await client.deleteCalendarObject({ calendarObject: found });
}

export async function listEventsForMirror(
  accountId: string,
  from: Date,
  to: Date,
): Promise<{
  externalId: string;
  startsAt: Date;
  endsAt: Date;
  title: string | null;
  location: string | null;
  url: string | null;
  kind: "event" | "vellum_owned_echo";
}[]> {
  const { account, client } = await clientFor(accountId);
  if (!account.defaultCalendarUrl) return [];

  // First try with timeRange — fast on servers that implement it.
  let objects = (await client.fetchCalendarObjects({
    calendar: { url: account.defaultCalendarUrl } as DAVCalendar,
    timeRange: { start: from.toISOString(), end: to.toISOString() },
  })) as DAVCalendarObject[];

  // Many self-hosted CalDAV servers (Radicale, Baikal, some mailcow builds)
  // silently ignore time-range filters on calendar-query and return nothing
  // when called with bounds. Fall back to fetching everything and filtering
  // client-side, which is correct everywhere at the cost of one extra round
  // trip when the cache is cold.
  if (objects.length === 0) {
    objects = (await client.fetchCalendarObjects({
      calendar: { url: account.defaultCalendarUrl } as DAVCalendar,
    })) as DAVCalendarObject[];
  }

  log.debug(`account=${accountId} fetched ${objects.length} objects from ${account.defaultCalendarUrl}`);

  const out: {
    externalId: string;
    startsAt: Date;
    endsAt: Date;
    title: string | null;
    location: string | null;
    url: string | null;
    kind: "event" | "vellum_owned_echo";
  }[] = [];
  let skipped = 0;
  let filteredOut = 0;
  for (const o of objects) {
    const ics = (o.data || "") as string;
    const ev = parseSingleVEvent(ics);
    if (!ev) {
      skipped += 1;
      log.trace(`unparseable object url=${o.url}`);
      continue;
    }
    // Filter to the requested window client-side. We're generous on the
    // bounds (overlap, not strict containment) so multi-day events show up.
    if (ev.end <= from || ev.start >= to) {
      filteredOut += 1;
      // Event titles routinely carry candidate names, so this stays at
      // trace — the per-item count is reported PII-free below.
      log.trace(
        `outside window: "${ev.summary || "(no title)"}" ${ev.start.toISOString()} → ${ev.end.toISOString()}`,
      );
      continue;
    }
    const ourEcho = (ev.uid || "").endsWith("@vellum");
    out.push({
      externalId: o.url,
      startsAt: ev.start,
      endsAt: ev.end,
      title: ev.summary,
      location: ev.location,
      url: ev.url,
      kind: ourEcho ? "vellum_owned_echo" : "event",
    });
  }
  log.debug(
    `account=${accountId} parsed ${out.length} kept (${skipped} unparseable, ${filteredOut} outside window)`,
  );
  return out;
}

/**
 * Minimal RFC-5545 VEVENT extractor. Just enough to populate the
 * mirror row — DTSTART, DTEND, DURATION, SUMMARY, LOCATION, URL, UID.
 *
 * Recurrence (RRULE) is not expanded — we surface only the first
 * occurrence the server returned, which is fine for busy detection.
 * Full RRULE expansion is a Phase 3 concern.
 */
function parseSingleVEvent(ics: string): {
  uid: string;
  start: Date;
  end: Date;
  summary: string | null;
  location: string | null;
  url: string | null;
} | null {
  const text = ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, ""); // unfold (CRLF + LF)
  const lines = text.split(/\r?\n/);
  let inEvent = false;
  let uid = "";
  let start: Date | null = null;
  let end: Date | null = null;
  let durationSec: number | null = null;
  let summary: string | null = null;
  let location: string | null = null;
  let url: string | null = null;
  let allDay = false;

  for (const raw of lines) {
    if (raw === "BEGIN:VEVENT") inEvent = true;
    else if (raw === "END:VEVENT") break;
    else if (!inEvent) continue;
    else if (raw.startsWith("UID:")) uid = raw.slice(4);
    else if (raw.startsWith("DTSTART")) {
      const parsed = parseIcsDate(raw);
      if (parsed) {
        start = parsed.date;
        allDay = allDay || parsed.allDay;
      }
    } else if (raw.startsWith("DTEND")) {
      const parsed = parseIcsDate(raw);
      if (parsed) {
        end = parsed.date;
        allDay = allDay || parsed.allDay;
      }
    } else if (raw.startsWith("DURATION:")) {
      durationSec = parseIcsDuration(raw.slice(9));
    } else if (raw.startsWith("SUMMARY:")) summary = unescapeIcsText(raw.slice(8));
    else if (raw.startsWith("LOCATION:")) location = unescapeIcsText(raw.slice(9));
    else if (raw.startsWith("URL:")) url = raw.slice(4);
  }
  if (!start) return null;
  // No DTEND? Spec allows DURATION or, for VEVENTs with DATE-only DTSTART, a
  // single-day default. Match common-sense defaults so the mirror is useful.
  if (!end) {
    if (durationSec !== null) {
      end = new Date(start.getTime() + durationSec * 1000);
    } else if (allDay) {
      end = new Date(start.getTime() + 86_400_000);
    } else {
      // Time-only DTSTART with no DTEND/DURATION = zero-length. Most clients
      // surface these as 30-min default — match that behaviour.
      end = new Date(start.getTime() + 30 * 60_000);
    }
  }
  return { uid, start, end, summary, location, url };
}

/**
 * Parse a DTSTART/DTEND line. Returns `{ date, allDay }` or null.
 *
 * Handles:
 *   DTSTART:20260528T100000Z          → UTC
 *   DTSTART;TZID=Europe/Berlin:20260528T100000 → local-clock-time
 *   DTSTART;VALUE=DATE:20260528       → all-day
 *
 * For TZID values we render at the same clock time in the user's local
 * timezone — that's the same behaviour the user's calendar app shows, and
 * it's correct for busy-detection. Full TZID-to-UTC conversion would need
 * an IANA tz database; Phase 3 territory.
 */
function parseIcsDate(line: string): { date: Date; allDay: boolean } | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const params = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const isAllDay = /VALUE=DATE\b/i.test(params) || /^\d{8}$/.test(value);

  if (isAllDay) {
    const m = value.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!m) return null;
    const [, y, mo, d] = m;
    return { date: new Date(`${y}-${mo}-${d}T00:00:00`), allDay: true };
  }

  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, z] = m;
  if (z === "Z") {
    return { date: new Date(`${y}-${mo}-${d}T${hh}:${mm}:${ss}Z`), allDay: false };
  }
  // Floating or TZID time: interpret as local clock time. `new Date(...)`
  // without `Z` does exactly this.
  return { date: new Date(`${y}-${mo}-${d}T${hh}:${mm}:${ss}`), allDay: false };
}

/**
 * Parse an ICS DURATION value like `PT1H30M` or `P1DT2H` into seconds.
 */
function parseIcsDuration(s: string): number | null {
  const m = s.match(/^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [, neg, w, d, h, mi, sec] = m;
  const total =
    (Number(w || 0) * 604800) +
    (Number(d || 0) * 86400) +
    (Number(h || 0) * 3600) +
    (Number(mi || 0) * 60) +
    Number(sec || 0);
  return neg ? -total : total;
}

function unescapeIcsText(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}
