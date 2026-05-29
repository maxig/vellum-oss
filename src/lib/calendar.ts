// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Minimal RFC 5545 iCalendar generator for interview invites.
 *
 * We deliberately don't pull in a fat library here — every mail client we'd
 * ever ship for (Gmail, Apple Mail, Outlook, Fastmail, ProtonMail) groks the
 * tiny subset of VCALENDAR we emit. The output is suitable both as an .ics
 * file attachment and as a `text/calendar; method=REQUEST` MIME alternative.
 *
 * Caller responsibilities:
 *   - Provide a stable `uid` per interview (we suggest `${interview.id}@vellum`).
 *   - Provide ISO-friendly Date objects for start; we compute end from durationMin.
 *   - Pass a sane `organizerEmail` — required so calendar apps display the invite
 *     as coming from your recruiting address rather than `unknown`.
 *
 * On revisions: bump the `sequence` argument on every re-send of the same UID so
 * calendar clients refresh the existing event instead of creating a duplicate.
 */

export type CalendarMethod = "REQUEST" | "CANCEL" | "PUBLISH";

export type IcsEventInput = {
  uid: string;
  start: Date;
  durationMinutes: number;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  organizer: { name: string; email: string };
  attendees: { name: string; email: string }[];
  /** Bumped on every re-send so calendar apps treat it as an update. */
  sequence?: number;
  /** Defaults to REQUEST; CANCEL when withdrawing an invite. */
  method?: CalendarMethod;
  /** Falls back to right now. */
  created?: Date;
};

/** Format a Date as a UTC `YYYYMMDDTHHmmssZ` stamp — RFC 5545 §3.3.5. */
function utcStamp(d: Date): string {
  const yyyy = d.getUTCFullYear().toString().padStart(4, "0");
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = d.getUTCDate().toString().padStart(2, "0");
  const hh = d.getUTCHours().toString().padStart(2, "0");
  const mi = d.getUTCMinutes().toString().padStart(2, "0");
  const ss = d.getUTCSeconds().toString().padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

/**
 * Escape RFC 5545 text values — comma, semicolon, backslash, newline. Quotes
 * don't need escaping in a TEXT value.
 */
function escText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/**
 * Fold long lines to ≤ 75 octets per RFC 5545 §3.1. Subsequent lines are
 * prefixed with a single space. Plain-ASCII safe heuristic — fine for our
 * use case which is ASCII summaries with the occasional UTF-8 hyphen.
 */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const chunk = line.slice(i, i + (out.length === 0 ? 75 : 74));
    out.push((out.length === 0 ? "" : " ") + chunk);
    i += chunk.length;
  }
  return out.join("\r\n");
}

export function buildIcs(input: IcsEventInput): string {
  const method = input.method || "REQUEST";
  const now = input.created || new Date();
  const end = new Date(input.start.getTime() + Math.max(5, input.durationMinutes) * 60_000);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vellum//ATS//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${escText(input.uid)}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(input.start)}`,
    `DTEND:${utcStamp(end)}`,
    `SEQUENCE:${input.sequence ?? 0}`,
    `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    `SUMMARY:${escText(input.summary)}`,
  ];

  if (input.description) lines.push(`DESCRIPTION:${escText(input.description)}`);
  if (input.location) lines.push(`LOCATION:${escText(input.location)}`);
  if (input.url) lines.push(`URL:${escText(input.url)}`);

  lines.push(
    `ORGANIZER;CN=${escText(input.organizer.name)}:mailto:${input.organizer.email}`,
  );
  for (const a of input.attendees) {
    lines.push(
      `ATTENDEE;CN=${escText(a.name)};RSVP=TRUE;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT:mailto:${a.email}`,
    );
  }

  // Apple/Outlook prefer at least one VALARM so the event surfaces in the
  // notification stack. 10 minutes is a sensible default for a screening call.
  lines.push(
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "TRIGGER:-PT10M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  );

  return lines.map(fold).join("\r\n") + "\r\n";
}
