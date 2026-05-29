// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Merge interviews + follow-ups + external busy blocks into one stream
 * for the Calendar view. CALENDAR_FEATURE.md §4.2.
 *
 * Three sources never share a table — they're stitched here at read
 * time. The output is the denormalised array the React view renders
 * directly (no N+1).
 */

import { db } from "@/lib/db";
import { isAdmin } from "@/lib/permissions";

export type CalendarEvent =
  | InterviewEvent
  | FollowUpEvent
  | ExternalBusyEvent;

export type InterviewEvent = {
  source: "interview";
  id: string;
  startsAt: string;
  endsAt: string;
  kind: string; // phone | video | onsite | panel
  status: string; // scheduled | done | cancelled | no_show
  candidate: { id: string; name: string };
  job: { id: string; title: string };
  applicationId: string;
  participants: { id: string; name: string }[];
  meetingUrl: string | null;
  location: string | null;
  syncStatus: string;
};

export type FollowUpEvent = {
  source: "followup";
  id: string;
  startsAt: string;          // we render follow-ups as a point-in-time chip — startsAt = endsAt = dueAt
  endsAt: string;
  kind: string;              // reply | decide | send_rejection | debrief | reference | nudge_offer | ai_suggested
  reason: string;
  candidate: { id: string; name: string };
  applicationId: string;
  state: string;
  ai: boolean;
};

export type ExternalBusyEvent = {
  source: "external";
  id: string;
  startsAt: string;
  endsAt: string;
  provider: string;
  title: string | null;
  url: string | null;
  location: string | null;
};

export type Scope = "mine" | "team" | "workspace";

export async function buildCalendarRange(opts: {
  workspaceId: string;
  userId: string;
  role: string;
  from: Date;
  to: Date;
  scope: Scope;
  includeTypes?: ("interview" | "followup" | "external")[];
}): Promise<CalendarEvent[]> {
  const includes = new Set(opts.includeTypes || ["interview", "followup", "external"]);

  // Resolve scope. Members can only see Mine; admins/owners can opt up.
  let effectiveScope = opts.scope;
  if (!isAdmin(opts.role) && effectiveScope === "workspace") effectiveScope = "mine";

  const out: CalendarEvent[] = [];

  // ── Interviews ──────────────────────────────────────────────────────
  if (includes.has("interview")) {
    const where: any = {
      workspaceId: opts.workspaceId,
      scheduledAt: { gte: opts.from, lte: opts.to },
      status: { in: ["scheduled", "done"] },
    };
    if (effectiveScope === "mine") {
      where.OR = [
        { participants: { some: { userId: opts.userId } } },
        { application: { reviewerId: opts.userId } },
      ];
    } else if (effectiveScope === "team") {
      where.OR = [
        { participants: { some: { userId: opts.userId } } },
        { application: { reviewerId: opts.userId } },
        { application: { job: { hiringTeam: { some: { userId: opts.userId } } } } },
      ];
    }

    const interviews = await db.interview.findMany({
      where,
      include: {
        application: {
          include: {
            candidate: { select: { id: true, name: true } },
            job: { select: { id: true, title: true } },
          },
        },
        participants: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
      orderBy: { scheduledAt: "asc" },
    });

    for (const iv of interviews) {
      out.push({
        source: "interview",
        id: iv.id,
        startsAt: iv.scheduledAt.toISOString(),
        endsAt: new Date(iv.scheduledAt.getTime() + (iv.durationMin || 45) * 60_000).toISOString(),
        kind: iv.kind,
        status: iv.status,
        candidate: iv.application.candidate,
        job: iv.application.job,
        applicationId: iv.applicationId,
        participants: iv.participants.map((p) => ({ id: p.user.id, name: p.user.name || p.user.email })),
        meetingUrl: iv.meetingUrl,
        location: iv.location,
        syncStatus: iv.syncStatus,
      });
    }
  }

  // ── Follow-ups ──────────────────────────────────────────────────────
  if (includes.has("followup")) {
    const followups = await db.followUp.findMany({
      where: {
        workspaceId: opts.workspaceId,
        state: "active",
        userId: effectiveScope === "workspace" ? undefined : opts.userId,
        dueAt: { gte: opts.from, lte: opts.to },
      },
      include: { application: { include: { candidate: { select: { id: true, name: true } } } } },
      orderBy: { dueAt: "asc" },
    });
    for (const f of followups) {
      const iso = f.dueAt.toISOString();
      out.push({
        source: "followup",
        id: f.id,
        startsAt: iso,
        endsAt: iso,
        kind: f.kind,
        reason: f.reason,
        candidate: f.application.candidate,
        applicationId: f.applicationId,
        state: f.state,
        ai: f.source === "ai",
      });
    }
  }

  // ── External busy ───────────────────────────────────────────────────
  if (includes.has("external")) {
    const accounts = await db.calendarAccount.findMany({
      where: { userId: opts.userId, enabled: true },
      select: { id: true, provider: true },
    });
    if (accounts.length > 0) {
      const accountIds = accounts.map((a) => a.id);
      const providerById = new Map(accounts.map((a) => [a.id, a.provider]));

      // Pull anything that overlaps the window.
      const mirrors = await db.calendarEventMirror.findMany({
        where: {
          accountId: { in: accountIds },
          startsAt: { lt: opts.to },
          endsAt: { gt: opts.from },
          // Drop our own echoes — those are interview rows in the
          // primary stream already.
          kind: { not: "vellum_owned_echo" },
        },
        orderBy: { startsAt: "asc" },
      });
      for (const m of mirrors) {
        out.push({
          source: "external",
          id: m.id,
          startsAt: m.startsAt.toISOString(),
          endsAt: m.endsAt.toISOString(),
          provider: providerById.get(m.accountId) || "unknown",
          title: m.title,
          url: m.url,
          location: m.location,
        });
      }
    }
  }

  // Final sort by start.
  out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return out;
}

/**
 * Aggregate busy windows for the slot-picker. Returns ISO ranges so
 * the client can mark conflicts without fetching candidate metadata.
 */
export async function readBusyWindows(opts: {
  workspaceId: string;
  userId: string;
  from: Date;
  to: Date;
}): Promise<{ startsAt: string; endsAt: string; source: "interview" | "external"; provider?: string }[]> {
  const ranges: { startsAt: string; endsAt: string; source: "interview" | "external"; provider?: string }[] = [];

  // Vellum's own interviews count as busy.
  const ivs = await db.interview.findMany({
    where: {
      workspaceId: opts.workspaceId,
      scheduledAt: { gte: opts.from, lte: opts.to },
      status: { in: ["scheduled"] },
      OR: [
        { participants: { some: { userId: opts.userId } } },
        { application: { reviewerId: opts.userId } },
      ],
    },
    select: { id: true, scheduledAt: true, durationMin: true },
  });
  for (const iv of ivs) {
    ranges.push({
      startsAt: iv.scheduledAt.toISOString(),
      endsAt: new Date(iv.scheduledAt.getTime() + (iv.durationMin || 45) * 60_000).toISOString(),
      source: "interview",
    });
  }

  // External calendars.
  const accounts = await db.calendarAccount.findMany({
    where: { userId: opts.userId, enabled: true },
    select: { id: true, provider: true },
  });
  if (accounts.length > 0) {
    const accountIds = accounts.map((a) => a.id);
    const providerById = new Map(accounts.map((a) => [a.id, a.provider]));
    const mirrors = await db.calendarEventMirror.findMany({
      where: {
        accountId: { in: accountIds },
        startsAt: { lt: opts.to },
        endsAt: { gt: opts.from },
        kind: { not: "vellum_owned_echo" },
      },
      select: { accountId: true, startsAt: true, endsAt: true },
    });
    for (const m of mirrors) {
      ranges.push({
        startsAt: m.startsAt.toISOString(),
        endsAt: m.endsAt.toISOString(),
        source: "external",
        provider: providerById.get(m.accountId) || "unknown",
      });
    }
  }

  return ranges;
}
