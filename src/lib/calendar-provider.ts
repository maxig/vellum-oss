// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Unified provider router. Internal callers (API routes, sync worker)
 * always go through this so the call sites don't branch on provider.
 *
 * See CALENDAR_FEATURE.md §9 for the conflict policy and §9.3 for the
 * mapping table.
 */

import { db } from "@/lib/db";
import * as google from "@/lib/google-calendar";
import * as microsoft from "@/lib/microsoft-calendar";
import * as caldav from "@/lib/caldav";
import { logger } from "@/lib/log";

const log = logger("calendar-provider");

export type InterviewPushPayload = {
  interviewId: string;
  summary: string;
  description: string;
  htmlDescription?: string;
  startsAt: Date;
  endsAt: Date;
  durationMin: number;
  timezone: string;
  location?: string | null;
  meetingUrl?: string | null;
  organizer: { name: string; email: string };
  attendees: { email: string; name?: string }[];
};

export async function pushInterview(
  accountId: string,
  payload: InterviewPushPayload,
): Promise<{ externalEventId: string }> {
  const account = await db.calendarAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new Error("account not found");
  switch (account.provider) {
    case "google":
      return google.pushInterview(accountId, {
        interviewId: payload.interviewId,
        summary: payload.summary,
        description: payload.description,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
        timezone: payload.timezone,
        location: payload.location,
        meetingUrl: payload.meetingUrl,
        attendees: payload.attendees,
      });
    case "microsoft":
      return microsoft.pushInterview(accountId, {
        interviewId: payload.interviewId,
        summary: payload.summary,
        htmlBody: payload.htmlDescription || `<p>${escapeHtml(payload.description)}</p>`,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
        timezone: payload.timezone,
        location: payload.location,
        meetingUrl: payload.meetingUrl,
        attendees: payload.attendees,
      });
    case "caldav":
      return caldav.pushInterview(accountId, {
        interviewId: payload.interviewId,
        summary: payload.summary,
        description: payload.description,
        startsAt: payload.startsAt,
        durationMin: payload.durationMin,
        location: payload.location,
        meetingUrl: payload.meetingUrl,
        organizer: payload.organizer,
        attendees: payload.attendees,
      });
    default:
      throw new Error(`unknown provider: ${account.provider}`);
  }
}

export async function patchInterview(
  accountId: string,
  externalEventId: string,
  payload: InterviewPushPayload,
): Promise<void> {
  const account = await db.calendarAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new Error("account not found");
  switch (account.provider) {
    case "google":
      return google.patchInterview(accountId, externalEventId, {
        interviewId: payload.interviewId,
        summary: payload.summary,
        description: payload.description,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
        timezone: payload.timezone,
        location: payload.location,
        meetingUrl: payload.meetingUrl,
        attendees: payload.attendees,
      });
    case "microsoft":
      return microsoft.patchInterview(accountId, externalEventId, {
        interviewId: payload.interviewId,
        summary: payload.summary,
        htmlBody: payload.htmlDescription || `<p>${escapeHtml(payload.description)}</p>`,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
        timezone: payload.timezone,
        location: payload.location,
        meetingUrl: payload.meetingUrl,
        attendees: payload.attendees,
      });
    case "caldav":
      return caldav.patchInterview(accountId, externalEventId, {
        interviewId: payload.interviewId,
        summary: payload.summary,
        description: payload.description,
        startsAt: payload.startsAt,
        durationMin: payload.durationMin,
        location: payload.location,
        meetingUrl: payload.meetingUrl,
        organizer: payload.organizer,
        attendees: payload.attendees,
      });
  }
}

export async function cancelInterview(accountId: string, externalEventId: string) {
  const account = await db.calendarAccount.findUnique({ where: { id: accountId } });
  if (!account) return;
  if (account.provider === "google") return google.cancelInterview(accountId, externalEventId);
  if (account.provider === "microsoft") return microsoft.cancelInterview(accountId, externalEventId);
  if (account.provider === "caldav") return caldav.cancelInterview(accountId, externalEventId);
}

export async function pullMirror(accountId: string, from: Date, to: Date): Promise<{ count: number }> {
  const account = await db.calendarAccount.findUnique({ where: { id: accountId } });
  if (!account) return { count: 0 };

  let events: Awaited<ReturnType<typeof google.listEventsForMirror>>;
  try {
    if (account.provider === "google") events = await google.listEventsForMirror(accountId, from, to);
    else if (account.provider === "microsoft") events = await microsoft.listEventsForMirror(accountId, from, to);
    else if (account.provider === "caldav") events = await caldav.listEventsForMirror(accountId, from, to);
    else return { count: 0 };
  } catch (e) {
    const msg = (e as Error).message || "unknown";
    await db.calendarAccount.update({
      where: { id: accountId },
      data: { consecutiveErrors: { increment: 1 }, lastError: msg, lastPolledAt: new Date() },
    });
    log.warn(`pullMirror failed for ${account.provider} ${accountId}: ${msg}`);
    throw e;
  }

  log.debug(
    `pullMirror ${account.provider} ${accountId} → ${events.length} events in [${from.toISOString()}, ${to.toISOString()}]`,
  );

  // Upsert in one transaction so the read side stays consistent. We
  // delete-then-insert any mirror in the queried window; events outside
  // [from, to] are left alone in case a previous wider pull seeded them.
  await db.$transaction(async (tx) => {
    await tx.calendarEventMirror.deleteMany({
      where: {
        accountId,
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
    });
    if (events.length > 0) {
      await tx.calendarEventMirror.createMany({
        data: events.map((e) => ({
          accountId,
          externalId: e.externalId,
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          title: e.title,
          location: e.location,
          url: e.url,
          kind: e.kind,
        })),
        skipDuplicates: true,
      });
    }
    await tx.calendarAccount.update({
      where: { id: accountId },
      data: { lastPolledAt: new Date(), consecutiveErrors: 0, lastError: null },
    });
  });
  return { count: events.length };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
