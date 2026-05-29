// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Calendar sync worker.
 *
 * CALENDAR_FEATURE.md §9. Ticks every minute. Per tick:
 *
 *   1. Drain the CalendarSyncJob outbox (push/patch/cancel/mirror_pull).
 *   2. For each enabled account, refresh free/busy mirror rows if we
 *      haven't polled in pollIntervalSec.
 *   3. Run the FollowUp generator for every workspace.
 *
 * Patterned 1:1 on review-queue-worker — same global singleton guard,
 * same explicit logging, same per-account try/catch.
 */

import { db } from "@/lib/db";
import * as provider from "@/lib/calendar-provider";
import { syncFollowUps } from "@/lib/follow-ups";

const TICK_MS = Number(process.env.CALENDAR_WORKER_TICK_MS || 60 * 1000);
const FOLLOWUP_TICK_MS = Number(process.env.CALENDAR_FOLLOWUP_TICK_MS || 10 * 60 * 1000);
const MIRROR_WINDOW_DAYS = 90;
const MAX_JOBS_PER_TICK = 8;

declare global {
  // eslint-disable-next-line no-var
  var __vellumCalendarWorker:
    | {
        started: boolean;
        running: boolean;
        timer: NodeJS.Timeout | null;
        ticks: number;
        lastFollowupAt: number;
      }
    | undefined;
}

function state() {
  if (!globalThis.__vellumCalendarWorker) {
    globalThis.__vellumCalendarWorker = {
      started: false,
      running: false,
      timer: null,
      ticks: 0,
      lastFollowupAt: 0,
    };
  }
  return globalThis.__vellumCalendarWorker!;
}

async function drainJobs(): Promise<{ ok: number; failed: number }> {
  const now = new Date();
  const jobs = await db.calendarSyncJob.findMany({
    where: { nextRunAt: { lte: now } },
    orderBy: { nextRunAt: "asc" },
    take: MAX_JOBS_PER_TICK,
  });
  let ok = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await runJob(job);
      await db.calendarSyncJob.delete({ where: { id: job.id } });
      ok += 1;
    } catch (e) {
      failed += 1;
      const attempts = job.attempts + 1;
      const backoffMin = Math.min(60, Math.pow(2, attempts));
      if (attempts >= 6) {
        await db.calendarSyncJob.delete({ where: { id: job.id } }).catch(() => null);
        await db.calendarAccount.update({
          where: { id: job.accountId },
          data: {
            consecutiveErrors: { increment: 1 },
            lastError: (e as Error).message || "unknown",
          },
        }).catch(() => null);
      } else {
        await db.calendarSyncJob.update({
          where: { id: job.id },
          data: {
            attempts,
            lastError: (e as Error).message || "unknown",
            nextRunAt: new Date(Date.now() + backoffMin * 60_000),
          },
        });
      }
    }
  }
  return { ok, failed };
}

async function runJob(job: { id: string; accountId: string; kind: string; payload: any }) {
  const payload = (job.payload || {}) as any;
  switch (job.kind) {
    case "push": {
      const iv = await db.interview.findUnique({
        where: { id: payload.interviewId },
        include: {
          application: {
            include: {
              candidate: true,
              job: true,
              workspace: true,
            },
          },
          participants: { include: { user: true } },
        },
      });
      if (!iv) return;
      const result = await provider.pushInterview(job.accountId, {
        interviewId: iv.id,
        summary: `${iv.application.candidate.name} — ${iv.application.job.title}`,
        description: iv.agenda?.replace(/<[^>]+>/g, "") || "",
        htmlDescription: iv.agenda || undefined,
        startsAt: iv.scheduledAt,
        endsAt: new Date(iv.scheduledAt.getTime() + (iv.durationMin || 45) * 60_000),
        durationMin: iv.durationMin || 45,
        timezone: iv.application.workspace.timezone || "UTC",
        location: iv.location,
        meetingUrl: iv.meetingUrl,
        organizer: { name: iv.application.workspace.name, email: payload.fromAddress || "noreply@vellum.local" },
        attendees: [
          ...(iv.application.candidate.email
            ? [{ email: iv.application.candidate.email, name: iv.application.candidate.name }]
            : []),
          ...iv.participants
            .filter((p) => p.user.email)
            .map((p) => ({ email: p.user.email, name: p.user.name || p.user.email })),
        ],
      });
      await db.interview.update({
        where: { id: iv.id },
        data: {
          externalEventId: result.externalEventId,
          externalAccountId: job.accountId,
          syncStatus: "ok",
          syncError: null,
        },
      });
      return;
    }
    case "patch": {
      const iv = await db.interview.findUnique({
        where: { id: payload.interviewId },
        include: {
          application: { include: { candidate: true, job: true, workspace: true } },
          participants: { include: { user: true } },
        },
      });
      if (!iv || !iv.externalEventId) return;
      await provider.patchInterview(job.accountId, iv.externalEventId, {
        interviewId: iv.id,
        summary: `${iv.application.candidate.name} — ${iv.application.job.title}`,
        description: iv.agenda?.replace(/<[^>]+>/g, "") || "",
        htmlDescription: iv.agenda || undefined,
        startsAt: iv.scheduledAt,
        endsAt: new Date(iv.scheduledAt.getTime() + (iv.durationMin || 45) * 60_000),
        durationMin: iv.durationMin || 45,
        timezone: iv.application.workspace.timezone || "UTC",
        location: iv.location,
        meetingUrl: iv.meetingUrl,
        organizer: { name: iv.application.workspace.name, email: payload.fromAddress || "noreply@vellum.local" },
        attendees: [
          ...(iv.application.candidate.email
            ? [{ email: iv.application.candidate.email, name: iv.application.candidate.name }]
            : []),
          ...iv.participants
            .filter((p) => p.user.email)
            .map((p) => ({ email: p.user.email, name: p.user.name || p.user.email })),
        ],
      });
      return;
    }
    case "cancel": {
      if (!payload.externalEventId) return;
      await provider.cancelInterview(job.accountId, payload.externalEventId);
      return;
    }
    case "mirror_pull": {
      const from = new Date();
      const to = new Date(Date.now() + MIRROR_WINDOW_DAYS * 86_400_000);
      await provider.pullMirror(job.accountId, from, to);
      return;
    }
    default:
      throw new Error(`unknown job kind: ${job.kind}`);
  }
}

async function refreshStaleMirrors() {
  const cutoff = new Date(Date.now() - 5 * 60_000);
  const accounts = await db.calendarAccount.findMany({
    where: {
      enabled: true,
      OR: [{ lastPolledAt: null }, { lastPolledAt: { lt: cutoff } }],
    },
    select: { id: true, pollIntervalSec: true, lastPolledAt: true },
  });
  for (const acc of accounts) {
    const interval = (acc.pollIntervalSec || 300) * 1000;
    const due = !acc.lastPolledAt || Date.now() - acc.lastPolledAt.getTime() >= interval;
    if (!due) continue;
    // Enqueue rather than running inline — keeps the tick bounded.
    await db.calendarSyncJob.create({
      data: { accountId: acc.id, kind: "mirror_pull", payload: {} },
    }).catch(() => null);
  }
}

async function refreshFollowUps() {
  const workspaces = await db.workspace.findMany({ select: { id: true } });
  for (const w of workspaces) {
    try {
      await syncFollowUps(w.id);
    } catch (e) {
      console.warn(`[calendar-worker] followups failed for ws=${w.id}:`, (e as Error).message);
    }
  }
}

async function tick() {
  const s = state();
  if (s.running) return;
  s.running = true;
  s.ticks += 1;
  const tickId = s.ticks;
  const startedAt = Date.now();
  try {
    const drained = await drainJobs();
    await refreshStaleMirrors();
    if (Date.now() - s.lastFollowupAt > FOLLOWUP_TICK_MS) {
      await refreshFollowUps();
      s.lastFollowupAt = Date.now();
    }
    console.log(
      `[calendar-worker] tick #${tickId} · ${Date.now() - startedAt}ms · jobs ok=${drained.ok} failed=${drained.failed}`,
    );
  } catch (e) {
    console.warn("[calendar-worker] tick error:", (e as Error).message);
  } finally {
    s.running = false;
  }
}

export function startCalendarWorker() {
  const s = state();
  if (s.started) return;
  s.started = true;
  s.timer = setInterval(() => {
    tick().catch((e) => console.warn("[calendar-worker] tick crashed:", e));
  }, TICK_MS);
  // Fire one immediately so a fresh boot doesn't wait a minute.
  setTimeout(() => tick().catch(() => null), 4_000);
  console.log(`[calendar-worker] started · tick=${TICK_MS}ms`);
}
