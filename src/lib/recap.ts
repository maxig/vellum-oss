// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// lib/recap.ts — Today's Recap engine
//
// One engine, three scopes (today / week / month). See RECAP_FEATURE.md.
// Items have two layers: deterministic (from DB queries) and AI (from the
// LLM, gated by feature toggle + provider configured).
//
// The result is cached per (workspace, scope, bucket) in RecapCache.

import { db } from "@/lib/db";
import { complete, getAIConfig, isAIEnabled } from "@/lib/ai";
import { workspaceStageMedians } from "@/lib/stage-history";
import type { Prisma } from "@prisma/client";

// ── Types ────────────────────────────────────────────────────────────
export type RecapScope = "today" | "week" | "month";

export type RecapItem = {
  id: string;
  source: "deterministic" | "ai";
  severity: "info" | "good" | "warn" | "celebrate";
  icon: string; // primitive Icons key
  text: string; // markdown (bold only) ≤140 chars
  entities: { kind: "candidate" | "job" | "user" | "source"; id: string; label: string }[];
  href?: string;
  scope: RecapScope;
  // Internal-only fields used by the ranker, stripped before persistence.
  _alwaysInclude?: boolean;
  _magnitude?: number; // log-scaled magnitude vs baseline; bigger ⇒ higher rank
  _at?: number;        // ms timestamp the underlying event happened (for recency boost)
};

export type RecapResult = {
  scope: RecapScope;
  bucket: string;
  items: RecapItem[];
  generatedAt: Date;
  fromCache: boolean;
  hasAI: boolean;
  aiError: boolean; // true when AI was enabled but failed or returned mock — surfaced as a tiny inline notice
};

const DAY = 86_400_000;

// Provider settings per §8. `today` is short; week and month are bigger
// because the LLM has more to summarise and a longer time budget.
const SCOPED_MAX_TOKENS: Record<RecapScope, number> = { today: 2000, week: 5000, month: 10000 };

// §6 — selection caps per scope. Easy to override in code; future workspace
// settings can shadow these via AIConfig.features.recapMaxItems.{scope}.
export const RECAP_LIMITS: Record<RecapScope, number> = { today: 5, week: 8, month: 12 };

// ── Public API ───────────────────────────────────────────────────────

/**
 * Cache-only read for the request path (dashboard / API). NEVER builds —
 * if nothing is cached, returns `null` and the caller decides what to
 * render (warming state, minimal deterministic fallback, etc.). The
 * background worker (lib/recap-worker.ts) is responsible for populating
 * the cache; the request path is responsible for being fast.
 */
export async function readCachedRecap(
  workspaceId: string,
  scope: RecapScope = "today",
): Promise<RecapResult | null> {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } });
  const bucket = bucketFor(scope, new Date(), ws?.timezone || "UTC");
  const cached = await db.recapCache.findUnique({
    where: { workspaceId_scope_bucket: { workspaceId, scope, bucket } },
  });
  if (!cached) return null;
  const items = cached.items as unknown as RecapItem[];
  return {
    scope,
    bucket,
    items,
    generatedAt: cached.generatedAt,
    fromCache: true,
    hasAI: cached.hasAI,
    // Heuristic: if AI is enabled for this workspace but the cached row
    // has no AI items, generation either errored or the model returned
    // no_findings. The UI shows a soft "AI insights paused" notice only
    // when the user has the AI feature on but the cache is missing them.
    aiError: (await isAIEnabled(workspaceId, "recap")) && !cached.hasAI,
  };
}

/**
 * Build (or rebuild) a recap. This is the slow path — it may call the LLM.
 * Only callers that can tolerate the latency (the background worker, the
 * forced /api/recap?force=1 endpoint, ad-hoc admin tooling) should use it.
 */
export async function buildRecap(
  workspaceId: string,
  scope: RecapScope = "today",
  opts: { force?: boolean } = {},
): Promise<RecapResult> {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, timezone: true } });
  const timezone = ws?.timezone || "UTC";
  const bucket = bucketFor(scope, new Date(), timezone);

  if (!opts.force) {
    const cached = await db.recapCache.findUnique({
      where: { workspaceId_scope_bucket: { workspaceId, scope, bucket } },
    });
    if (cached && cached.expiresAt > new Date()) {
      return {
        scope,
        bucket,
        items: cached.items as unknown as RecapItem[],
        generatedAt: cached.generatedAt,
        fromCache: true,
        hasAI: cached.hasAI,
        aiError: false,
      };
    }
  }

  const window = scopeWindow(scope, new Date(), timezone);
  const deterministic = await buildDeterministic(workspaceId, scope, window);
  const aiOn = await isAIEnabled(workspaceId, "recap");
  let ai: RecapItem[] = [];
  let aiError = false;
  if (aiOn) {
    const result = await buildAI(workspaceId, scope, window, deterministic, ws?.name || "Workspace");
    ai = result.items;
    aiError = result.error;
  }
  const items = rank(deterministic.concat(ai), scope).map(stripInternal);

  const ttl = scope === "today" ? 15 * 60 * 1000 : scope === "week" ? 6 * 3600 * 1000 : 24 * 3600 * 1000;
  const expiresAt = new Date(Date.now() + ttl);
  await db.recapCache.upsert({
    where: { workspaceId_scope_bucket: { workspaceId, scope, bucket } },
    create: {
      workspaceId,
      scope,
      bucket,
      items: items as unknown as Prisma.InputJsonValue,
      hasAI: ai.length > 0,
      expiresAt,
    },
    update: {
      items: items as unknown as Prisma.InputJsonValue,
      hasAI: ai.length > 0,
      generatedAt: new Date(),
      expiresAt,
    },
  });

  return { scope, bucket, items, generatedAt: new Date(), fromCache: false, hasAI: ai.length > 0, aiError };
}

/**
 * Wipe every cached recap for a workspace. Used by the Danger zone button
 * and by future Right-to-be-Forgotten flows. Returns the number of rows
 * removed so the caller can show a confirmation toast.
 */
export async function purgeRecapCache(workspaceId: string): Promise<number> {
  const result = await db.recapCache.deleteMany({ where: { workspaceId } });
  return result.count;
}

/**
 * Personalize an already-built RecapResult for a specific recipient.
 * Re-ranks the items with an `audience_relevance` boost so the recipient
 * sees items about *their* roles/candidates surface first. Does NOT
 * regenerate or call the LLM — purely a reorder of existing items.
 */
export async function personalizeRecap(
  workspaceId: string,
  result: RecapResult,
  recipientUserId: string,
): Promise<RecapResult> {
  const apps = await db.application.findMany({
    where: { workspaceId, reviewerId: recipientUserId, archived: false },
    select: { jobId: true, candidateId: true },
  }).catch(() => []);
  const ownedJobIds = new Set(apps.map((a) => a.jobId));
  const ownedCandidateIds = new Set(apps.map((a) => a.candidateId));

  // Re-rank with the audience context — keep the same limit per scope.
  // We have to add the internal scoring fields back for the ranker since
  // we strip them before persistence; pass-through what we know (severity
  // is enough; everything else defaults sensibly inside rank()).
  const reranked = rank(
    result.items.map((it) => ({ ...it })),
    result.scope,
    { recipientUserId, ownedJobIds, ownedCandidateIds },
  );
  return { ...result, items: reranked };
}

/**
 * Right-to-be-Forgotten helper. Once we have a candidate-delete flow, the
 * delete handler should invalidate any cached recap that referenced this
 * candidate so the deletion takes effect immediately (rather than waiting
 * for the cache TTL).
 *
 * For now this just purges the workspace's full cache — refining it to
 * "only buckets whose items reference this candidate" is a future
 * optimization, but the conservative purge is correct.
 */
export async function purgeRecapCacheForCandidate(
  workspaceId: string,
  _candidateId: string,
): Promise<number> {
  return purgeRecapCache(workspaceId);
}

// ── Scope window helpers ─────────────────────────────────────────────

type ScopeWindow = { start: Date; end: Date; previousStart: Date; previousEnd: Date };

/**
 * Compute the scope window in the workspace's local timezone. `previousStart`
 * / `previousEnd` describe the immediately-preceding window of the same
 * size, used to compute deltas (today vs yesterday, this week vs last
 * week, this month vs last month) in the AI context payload.
 */
function scopeWindow(scope: RecapScope, now: Date, timezone: string): ScopeWindow {
  // Workspace-local-now parts, converted back to a JS Date (which is
  // still UTC under the hood but anchored to the local-day instant).
  const local = localTimeParts(now, timezone);
  if (scope === "today") {
    const start = localDateAtUTC(local.year, local.month, local.day, 0, 0, timezone);
    const previousStart = new Date(start.getTime() - DAY);
    return { start, end: now, previousStart, previousEnd: start };
  }
  if (scope === "week") {
    const end = now;
    const start = new Date(end.getTime() - 7 * DAY);
    return { start, end, previousStart: new Date(start.getTime() - 7 * DAY), previousEnd: start };
  }
  // month — first of current month, workspace-local
  const start = localDateAtUTC(local.year, local.month, 1, 0, 0, timezone);
  // previous month
  const prevMonth = local.month === 1 ? 12 : local.month - 1;
  const prevYear = local.month === 1 ? local.year - 1 : local.year;
  const previousStart = localDateAtUTC(prevYear, prevMonth, 1, 0, 0, timezone);
  return { start, end: now, previousStart, previousEnd: start };
}

function bucketFor(scope: RecapScope, now: Date, timezone: string): string {
  const local = localTimeParts(now, timezone);
  if (scope === "today") return `${local.year}-${pad(local.month)}-${pad(local.day)}`;
  if (scope === "month") return `${local.year}-${pad(local.month)}`;
  // ISO week — computed from workspace-local-anchored UTC.
  const d = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(weekNum)}`;
}

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number };
function localTimeParts(d: Date, timezone: string): LocalParts {
  // Intl is the only Node-native way to do TZ-correct local components
  // without pulling in a date library.
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value])) as Record<string, string>;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/**
 * Anchor a wall-clock local time to a UTC instant. We don't have a true TZ
 * offset, but iterating with `Intl` to find the correct offset is overkill
 * for our purposes: at-most-1-hour drift around DST transitions is
 * acceptable for daily/weekly/monthly bucket math.
 */
function localDateAtUTC(year: number, month: number, day: number, hour: number, minute: number, timezone: string): Date {
  // Build the date in UTC, then offset by the timezone's current offset to
  // the same wall clock.
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offsetMinutes = getOffsetMinutes(utc, timezone);
  return new Date(utc.getTime() - offsetMinutes * 60_000);
}

function getOffsetMinutes(d: Date, timezone: string): number {
  const local = localTimeParts(d, timezone);
  const asIfUTC = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  return Math.round((asIfUTC - d.getTime()) / 60_000);
}

function pad(n: number) { return String(n).padStart(2, "0"); }

// ── Deterministic catalog ────────────────────────────────────────────
async function buildDeterministic(
  workspaceId: string,
  scope: RecapScope,
  window: ScopeWindow,
): Promise<RecapItem[]> {
  const wid = workspaceId;
  const { start, end, previousStart, previousEnd } = window;
  const nowMs = Date.now();

  // Resolve recap thresholds from AIConfig.recapSettings (per RECAP_FEATURE
  // §11.4); fall back to spec defaults when unset.
  const cfg = await db.aIConfig.findUnique({
    where: { workspaceId: wid },
    select: { recapSettings: true },
  });
  const recapSettings = (cfg?.recapSettings as Record<string, unknown> | null) || {};
  const thresholds = (recapSettings.thresholds as Record<string, number> | undefined) || {};
  const STALE_STAGE_MULTIPLIER = thresholds.staleStageMultiplier ?? 1.5;
  const AWAITING_REPLY_HOURS = thresholds.awaitingReplyHours ?? 48;
  const RETENTION_WARN_DAYS = thresholds.retentionWarningDays ?? 30;

  const [
    appsInScope,
    appsPreviousScope,
    appsByJob,
    appsBySource,
    hiredInScope,
    offersInScope,
    offerPendingApps,
    stalledApps,
    interviewsToday,
    interviewsTomorrow,
    awaitingReply,
    unreadThreads,
    coolingCandidates,
    hotAtOffer,
    topApplicant,
    fitDistribution,
    sourceQualityRaw,
    staleDraftJobs,
    topRecruiter,
    gdprHorizonCount,
  ] = await Promise.all([
    db.application.count({ where: { workspaceId: wid, appliedAt: { gte: start, lte: end } } }),
    db.application.count({ where: { workspaceId: wid, appliedAt: { gte: previousStart, lt: previousEnd } } }),
    db.application.groupBy({
      by: ["jobId"],
      where: { workspaceId: wid, appliedAt: { gte: start, lte: end } },
      _count: { _all: true },
      orderBy: { _count: { jobId: "desc" } },
      take: 1,
    }),
    db.candidate.groupBy({
      by: ["source"],
      where: { workspaceId: wid, createdAt: { gte: start, lte: end } },
      _count: { _all: true },
      orderBy: { _count: { source: "desc" } },
      take: 5,
    }),
    db.application.findMany({
      where: { workspaceId: wid, stage: { key: "hired" }, updatedAt: { gte: start, lte: end } },
      include: { candidate: true, job: true },
      take: 5,
    }),
    db.application.count({
      where: { workspaceId: wid, stage: { key: "offer" }, updatedAt: { gte: start, lte: end } },
    }),
    // offer_pending: in offer stage, untouched ≥ 2 days. Spec §4.4.
    db.application.findMany({
      where: {
        workspaceId: wid,
        archived: false,
        stage: { key: "offer" },
        updatedAt: { lt: new Date(nowMs - 2 * DAY) },
      },
      include: { candidate: true, job: true, stage: true },
      orderBy: { updatedAt: "asc" },
      take: 3,
    }),
    // Stalled in screen/interview. Pre-filter by a low bar (≥ 2 days);
    // we refine with per-stage median × workspace multiplier below.
    db.application.findMany({
      where: {
        workspaceId: wid,
        archived: false,
        stage: { key: { in: ["screen", "interview"] } },
        updatedAt: { lt: new Date(nowMs - 2 * DAY) },
      },
      include: { stage: true, candidate: true },
      orderBy: { updatedAt: "asc" },
      take: 15,
    }),
    db.interview.count({
      where: {
        workspaceId: wid,
        scheduledAt: {
          gte: startOfDay(new Date()),
          lt: new Date(startOfDay(new Date()).getTime() + DAY),
        },
      },
    }),
    db.interview.count({
      where: {
        workspaceId: wid,
        scheduledAt: {
          gte: new Date(startOfDay(new Date()).getTime() + DAY),
          lt: new Date(startOfDay(new Date()).getTime() + 2 * DAY),
        },
      },
    }),
    db.application.count({
      where: {
        workspaceId: wid,
        archived: false,
        stage: { key: "applied" },
        appliedAt: { lt: new Date(nowMs - (AWAITING_REPLY_HOURS * 3600 * 1000)) },
      },
    }),
    db.thread.count({ where: { workspaceId: wid, unread: true } }),
    // Pulse-driven cool / cold / silent strong candidates.
    db.candidate.findMany({
      where: {
        workspaceId: wid,
        pulseBand: { in: ["cool", "cold"] },
        applications: { some: { aiFit: { gte: 70 } } },
      },
      take: 5,
      orderBy: { pulseUpdatedAt: "desc" },
    }),
    db.candidate.count({
      where: {
        workspaceId: wid,
        pulseBand: "hot",
        applications: { some: { stage: { key: "offer" } } },
      },
    }),
    // top_applicant — highest-fit applicant in scope.
    db.application.findFirst({
      where: { workspaceId: wid, appliedAt: { gte: start, lte: end }, aiFit: { gte: 85 } },
      orderBy: { aiFit: "desc" },
      include: { candidate: true, job: true },
    }),
    // fit_distribution — how many of the scope's apps cleared the 85 bar.
    db.application.findMany({
      where: { workspaceId: wid, appliedAt: { gte: start, lte: end } },
      select: { aiFit: true },
    }),
    // source_quality — apps grouped by candidate source with avg aiFit.
    // We get the raw rows and aggregate in JS so we can compute per-source
    // averages without needing a SQL view.
    db.application.findMany({
      where: { workspaceId: wid, appliedAt: { gte: start, lte: end }, aiFit: { not: null } },
      include: { candidate: { select: { source: true } } },
    }),
    // stale_drafts — jobs created ≥ 7d ago, status=Draft, no recent
    // publishedAt. Used only on weekly+monthly recaps.
    scope === "today"
      ? Promise.resolve([])
      : db.job.findMany({
          where: { workspaceId: wid, status: "Draft", createdAt: { lt: new Date(nowMs - 7 * DAY) } },
          take: 3,
          orderBy: { createdAt: "asc" },
        }),
    // top_recruiter — only meaningful for week+month windows.
    scope === "today"
      ? Promise.resolve([] as { actorId: string | null; _count: { _all: number } }[])
      : db.activity.groupBy({
          by: ["actorId"],
          where: {
            workspaceId: wid,
            createdAt: { gte: start, lte: end },
            actorId: { not: null },
            kind: { in: ["moved", "noted", "scheduled", "published"] },
          },
          _count: { _all: true },
          orderBy: { _count: { actorId: "desc" } },
          take: 1,
        }),
    // gdpr_retention — only meaningful on monthly; counts candidates
    // approaching the 12-month horizon over the configured warning window.
    scope === "month"
      ? db.candidate.count({
          where: {
            workspaceId: wid,
            createdAt: {
              gte: new Date(nowMs - 365 * DAY),
              lt: new Date(nowMs - (365 - RETENTION_WARN_DAYS) * DAY),
            },
          },
        })
      : Promise.resolve(0),
  ]);

  const items: RecapItem[] = [];

  // apps_received — always include if ≥1. Magnitude = log delta vs prior period.
  if (appsInScope > 0) {
    const deltaPct =
      appsPreviousScope > 0
        ? Math.round(((appsInScope - appsPreviousScope) / appsPreviousScope) * 100)
        : null;
    const deltaText = deltaPct != null
      ? ` — ${deltaPct >= 0 ? "↑" : "↓"} ${Math.abs(deltaPct)}% vs ${scope === "today" ? "yesterday" : scope === "week" ? "last week" : "last month"}`
      : "";
    items.push({
      id: "apps_received",
      source: "deterministic",
      severity: appsInScope >= 10 ? "good" : "info",
      icon: "Check",
      text: scope === "today"
        ? `**${appsInScope}** application${appsInScope === 1 ? "" : "s"} today${deltaText}.`
        : `**${appsInScope}** application${appsInScope === 1 ? "" : "s"} in scope${deltaText}.`,
      entities: [],
      href: "/candidates",
      scope,
      _at: nowMs,
      _magnitude: deltaPct != null ? Math.log10(Math.max(1, Math.abs(deltaPct))) : 0,
    });
  }

  // apps_per_job (top by applications in scope) — needs the job title.
  if (appsByJob.length) {
    const top = appsByJob[0];
    const job = await db.job.findUnique({ where: { id: top.jobId }, select: { title: true } });
    if (job) {
      items.push({
        id: "apps_per_job",
        source: "deterministic",
        severity: "info",
        icon: "Sparkle",
        text: `**${job.title}** picked up the most applications — ${top._count._all}.`,
        entities: [{ kind: "job", id: top.jobId, label: job.title }],
        href: `/jobs/${top.jobId}`,
        scope,
        _at: nowMs,
      });
    }
  }

  // top_source — fires only when one source dominates the scope (>50%).
  const sourceTotal = appsBySource.reduce((sum, s) => sum + s._count._all, 0);
  if (sourceTotal >= 4 && appsBySource.length > 0) {
    const top = appsBySource[0];
    const share = top._count._all / sourceTotal;
    if (share > 0.5 && top.source) {
      const pct = Math.round(share * 100);
      items.push({
        id: "top_source",
        source: "deterministic",
        severity: "info",
        icon: "Globe",
        text: `${pct}% of ${scope === "today" ? "today's" : "this scope's"} applications came from **${top.source}**.`,
        entities: [{ kind: "source", id: top.source, label: top.source }],
        href: "/analytics",
        scope,
        _at: nowMs,
      });
    }
  }

  // hires — always include. Each gets its own item.
  for (const h of hiredInScope) {
    items.push({
      id: `hires_${h.id}`,
      source: "deterministic",
      severity: "celebrate",
      icon: "Heart",
      text: `🎉 **${h.candidate.name}** signed for ${h.job.title}.`,
      entities: [
        { kind: "candidate", id: h.candidateId, label: h.candidate.name },
        { kind: "job", id: h.jobId, label: h.job.title },
      ],
      href: `/candidates/${h.candidateId}`,
      scope,
      _alwaysInclude: true,
      _at: h.updatedAt.getTime(),
    });
  }

  // offers in flight (count).
  if (offersInScope > 0) {
    items.push({
      id: "offers_in_flight",
      source: "deterministic",
      severity: "info",
      icon: "FileText",
      text: `**${offersInScope}** offer${offersInScope === 1 ? "" : "s"} in flight.`,
      entities: [],
      href: "/pipeline",
      scope,
      _at: nowMs,
    });
  }

  // offer_pending — sits at offer stage with no activity ≥ 2d.
  // Spec §4.4 — always-include when N ≥ 3 days.
  for (const op of offerPendingApps) {
    const daysSince = Math.floor((nowMs - op.updatedAt.getTime()) / DAY);
    items.push({
      id: `offer_pending_${op.id}`,
      source: "deterministic",
      severity: "warn",
      icon: "Clock",
      text: `**${op.candidate.name}** has been at *Offer* for ${daysSince} day${daysSince === 1 ? "" : "s"} — check the letter.`,
      entities: [
        { kind: "candidate", id: op.candidateId, label: op.candidate.name },
        { kind: "job", id: op.jobId, label: op.job.title },
      ],
      href: `/candidates/${op.candidateId}`,
      scope,
      _alwaysInclude: daysSince >= 3,
      _at: op.updatedAt.getTime(),
      _magnitude: Math.log10(Math.max(1, daysSince)),
    });
  }

  // stalled — now using per-stage median × workspace multiplier (spec §4.4).
  // Fall back to a static 5-day cut for stages with no history yet.
  const stageMedians = await workspaceStageMedians(wid).catch(() => ({} as Record<string, number>));
  const trulyStalled = stalledApps.filter((a) => {
    if (!a.stage) return false;
    const median = stageMedians[a.stage.key];
    const thresholdDays = median != null
      ? Math.max(2, median * STALE_STAGE_MULTIPLIER)
      : 5;
    const dwellDays = (nowMs - a.updatedAt.getTime()) / DAY;
    return dwellDays >= thresholdDays;
  });
  if (trulyStalled.length > 0) {
    const oldest = trulyStalled[0];
    const median = stageMedians[oldest.stage?.key || ""];
    const thresholdDescription = median != null
      ? `more than ${(median * STALE_STAGE_MULTIPLIER).toFixed(1)}d (your team's median × ${STALE_STAGE_MULTIPLIER})`
      : "more than 5 days";
    items.push({
      id: "stalled_candidates",
      source: "deterministic",
      severity: "warn",
      icon: "Clock",
      text: `**${trulyStalled.length}** candidate${trulyStalled.length === 1 ? " has" : "s have"} been in *${oldest.stage?.name || "stage"}* ${thresholdDescription}.`,
      entities: trulyStalled.slice(0, 5).map((s) => ({ kind: "candidate" as const, id: s.candidateId, label: s.candidate.name })),
      href: "/pipeline",
      scope,
      _at: oldest.updatedAt.getTime(),
      _magnitude: Math.log10(Math.max(1, trulyStalled.length)),
    });
  }

  // interviews today / tomorrow.
  if (interviewsToday + interviewsTomorrow > 0) {
    items.push({
      id: "interviews_today",
      source: "deterministic",
      severity: "info",
      icon: "Calendar",
      text: `**${interviewsToday}** interview${interviewsToday === 1 ? "" : "s"} today${interviewsTomorrow ? `, ${interviewsTomorrow} tomorrow` : ""}.`,
      entities: [],
      href: "/pipeline",
      scope,
      _at: nowMs,
    });
  }

  // awaiting reply.
  if (awaitingReply > 0) {
    items.push({
      id: "awaiting_reply",
      source: "deterministic",
      severity: "warn",
      icon: "Clock",
      text: `**${awaitingReply}** candidate${awaitingReply === 1 ? "" : "s"} awaiting a first reply for >${AWAITING_REPLY_HOURS}h.`,
      entities: [],
      href: "/inbox",
      scope,
      _at: nowMs,
      _magnitude: Math.log10(Math.max(1, awaitingReply)),
    });
  }

  // unread_threads — separate signal from awaiting_reply. This is overall
  // unread count, not "first reply needed".
  if (unreadThreads > 0) {
    items.push({
      id: "unread_threads",
      source: "deterministic",
      severity: "info",
      icon: "Inbox",
      text: `**${unreadThreads}** unread inbox thread${unreadThreads === 1 ? "" : "s"}.`,
      entities: [],
      href: "/inbox",
      scope,
      _at: nowMs,
    });
  }

  // top_applicant.
  if (topApplicant && topApplicant.aiFit != null) {
    items.push({
      id: `top_applicant_${topApplicant.id}`,
      source: "deterministic",
      severity: "good",
      icon: "Sparkle",
      text: `Strongest applicant ${scope === "today" ? "today" : "in scope"}: **${topApplicant.candidate.name}** · AI-fit ${topApplicant.aiFit} for ${topApplicant.job.title}.`,
      entities: [
        { kind: "candidate", id: topApplicant.candidateId, label: topApplicant.candidate.name },
        { kind: "job", id: topApplicant.jobId, label: topApplicant.job.title },
      ],
      href: `/candidates/${topApplicant.candidateId}`,
      scope,
      _at: topApplicant.appliedAt.getTime(),
      _magnitude: Math.log10(Math.max(1, topApplicant.aiFit - 84)),
    });
  }

  // fit_distribution — skip if scope is too small to be meaningful.
  if (fitDistribution.length >= 5) {
    const above = fitDistribution.filter((a) => (a.aiFit ?? 0) >= 85).length;
    if (above > 0) {
      items.push({
        id: "fit_distribution",
        source: "deterministic",
        severity: "good",
        icon: "Sparkle",
        text: `**${above} of ${fitDistribution.length}** new applicant${fitDistribution.length === 1 ? "" : "s"} scored above the 85 fit threshold.`,
        entities: [],
        href: "/candidates",
        scope,
        _at: nowMs,
      });
    }
  }

  // source_quality — compares the top-2 sources by avg fit, surfaces if
  // delta ≥ 15 pts and each source has ≥ 3 applications.
  const sourceQuality = aggregateBySource(sourceQualityRaw);
  if (sourceQuality.length >= 2 && scope !== "today") {
    const sorted = [...sourceQuality].sort((a, b) => b.avg - a.avg);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    if (best.n >= 3 && worst.n >= 3 && best.avg - worst.avg >= 15) {
      items.push({
        id: "source_quality",
        source: "deterministic",
        severity: "good",
        icon: "Sparkle",
        text: `**${best.source}** applicants average ${best.avg} fit vs ${worst.source} at ${worst.avg}.`,
        entities: [{ kind: "source", id: best.source, label: best.source }],
        href: "/analytics",
        scope,
        _at: nowMs,
        _magnitude: Math.log10(Math.max(1, best.avg - worst.avg)),
      });
    }
  }

  // Pulse-derived items.
  if (coolingCandidates.length > 0) {
    const names = coolingCandidates.slice(0, 2).map((c) => c.name).join(", ");
    items.push({
      id: "cooling_candidates",
      source: "deterministic",
      severity: "warn",
      icon: "Clock",
      text: `**${coolingCandidates.length}** strong candidate${coolingCandidates.length === 1 ? "" : "s"} cooled — ${names}.`,
      entities: coolingCandidates.map((c) => ({ kind: "candidate" as const, id: c.id, label: c.name })),
      href: "/candidates",
      scope,
      _at: coolingCandidates[0].pulseUpdatedAt?.getTime() || nowMs,
      _magnitude: Math.log10(Math.max(1, coolingCandidates.length)),
    });
  }
  if (hotAtOffer > 0) {
    items.push({
      id: "hot_at_offer",
      source: "deterministic",
      severity: "good",
      icon: "Sparkle",
      text: `**${hotAtOffer}** candidate${hotAtOffer === 1 ? " is" : "s are"} Hot at offer stage — accelerate the letter${hotAtOffer === 1 ? "" : "s"}.`,
      entities: [],
      href: "/pipeline",
      scope,
      _at: nowMs,
    });
  }

  // stale_drafts (weekly+monthly).
  for (const d of staleDraftJobs) {
    const days = Math.floor((nowMs - d.createdAt.getTime()) / DAY);
    items.push({
      id: `stale_draft_${d.id}`,
      source: "deterministic",
      severity: "info",
      icon: "FileText",
      text: `**${d.title}** has been in Draft for ${days} days with no edits.`,
      entities: [{ kind: "job", id: d.id, label: d.title }],
      href: `/jobs/${d.id}`,
      scope,
      _at: d.createdAt.getTime(),
    });
  }

  // top_recruiter (weekly+monthly).
  if (topRecruiter.length > 0 && topRecruiter[0].actorId) {
    const u = await db.user.findUnique({
      where: { id: topRecruiter[0].actorId },
      select: { id: true, name: true, email: true },
    });
    if (u) {
      const label = u.name || u.email;
      items.push({
        id: "top_recruiter",
        source: "deterministic",
        severity: "good",
        icon: "Heart",
        text: `Most active ${scope === "week" ? "this week" : "this month"}: **${label}** — ${topRecruiter[0]._count._all} activit${topRecruiter[0]._count._all === 1 ? "y" : "ies"}.`,
        entities: [{ kind: "user", id: u.id, label }],
        href: "/pipeline",
        scope,
        _at: nowMs,
      });
    }
  }

  // gdpr_retention (monthly).
  if (gdprHorizonCount > 0) {
    items.push({
      id: "gdpr_retention",
      source: "deterministic",
      severity: "warn",
      icon: "FileText",
      text: `**${gdprHorizonCount}** candidate record${gdprHorizonCount === 1 ? " reaches" : "s reach"} the 12-month retention horizon next month.`,
      entities: [],
      href: "/candidates",
      scope,
      _at: nowMs,
      _magnitude: Math.log10(Math.max(1, gdprHorizonCount)),
    });
  }

  // ── Items powered by new tables (added in the deferred-features sweep) ─
  // Career-site analytics, stage history, interview debriefs, sentiment
  // results, reviewer assignments, GDPR consent. Each is independent so a
  // missing source table doesn't take the rest of the recap down.
  const moreItems = await buildAuxiliaryItems(wid, scope, window, thresholds);
  items.push(...moreItems);

  // Apply the "apps_received as only volume" always-include override.
  // (We tag here, the ranker enforces.)
  const volumeIds = ["apps_received", "apps_per_job", "top_source"];
  const volumePresent = items.filter((i) => volumeIds.includes(i.id));
  if (volumePresent.length === 1 && volumePresent[0].id === "apps_received") {
    volumePresent[0]._alwaysInclude = true;
  }

  return items;
}

/**
 * Builds the items that depend on the schemas added in the deferred-features
 * sweep. Split out from buildDeterministic to keep the main function legible
 * and to let each query fail independently.
 */
async function buildAuxiliaryItems(
  workspaceId: string,
  scope: RecapScope,
  window: ScopeWindow,
  _thresholds: Record<string, number>,
): Promise<RecapItem[]> {
  const wid = workspaceId;
  const { start, end, previousStart, previousEnd } = window;
  const nowMs = Date.now();
  const items: RecapItem[] = [];

  const [
    visitorsInScope,
    visitorsPrev,
    topJobByViews,
    apsByJob,
    viewsByJob,
    stageMovesByPair,
    interviewDebriefs,
    sentimentRowsScope,
    reviewLoads,
    missingConsentCount,
  ] = await Promise.all([
    // new_visitors — distinct sessions with at least one page_view in scope.
    db.careerSiteEvent
      .findMany({
        where: { workspaceId: wid, kind: "page_view", createdAt: { gte: start, lte: end } },
        select: { sessionId: true },
        distinct: ["sessionId"],
      })
      .catch(() => []),
    // Previous period for delta.
    db.careerSiteEvent
      .findMany({
        where: { workspaceId: wid, kind: "page_view", createdAt: { gte: previousStart, lt: previousEnd } },
        select: { sessionId: true },
        distinct: ["sessionId"],
      })
      .catch(() => []),
    // top_job_views — most-viewed job in scope.
    db.careerSiteEvent
      .groupBy({
        by: ["jobId"],
        where: { workspaceId: wid, kind: "page_view", jobId: { not: null }, createdAt: { gte: start, lte: end } },
        _count: { _all: true },
        orderBy: { _count: { jobId: "desc" } },
        take: 1,
      })
      .catch(() => []),
    // Per-job apply_complete counts in scope (for low_apply_rate calc).
    db.careerSiteEvent
      .groupBy({
        by: ["jobId"],
        where: { workspaceId: wid, kind: "apply_complete", jobId: { not: null }, createdAt: { gte: start, lte: end } },
        _count: { _all: true },
      })
      .catch(() => []),
    // Per-job page views in scope (also for low_apply_rate).
    db.careerSiteEvent
      .groupBy({
        by: ["jobId"],
        where: { workspaceId: wid, kind: "page_view", jobId: { not: null }, createdAt: { gte: start, lte: end } },
        _count: { _all: true },
      })
      .catch(() => []),
    // stage_moves — distinct transitions in scope, with from/to counts.
    db.candidateStageHistory
      .groupBy({
        by: ["toStageKey"],
        where: { workspaceId: wid, movedAt: { gte: start, lte: end } },
        _count: { _all: true },
      })
      .catch(() => []),
    // interview_outcomes — debriefs filed in scope, grouped by sentiment.
    db.interviewDebrief
      .findMany({
        where: { workspaceId: wid, createdAt: { gte: start, lte: end } },
        select: { sentiment: true, rating: true, recommend: true },
      })
      .catch(() => []),
    // sentiment_concerns_summary — concern counts in scope vs 90-day baseline.
    db.sentimentResult
      .findMany({
        where: { workspaceId: wid, createdAt: { gte: start, lte: end } },
        select: { sentiment: true, concerns: true },
      })
      .catch(() => []),
    // review_load — group apps by reviewer to find anyone with a heavy plate.
    scope === "today"
      ? Promise.resolve([] as { reviewerId: string | null; _count: { _all: number } }[])
      : db.application
          .groupBy({
            by: ["reviewerId"],
            where: { workspaceId: wid, archived: false, reviewerId: { not: null } },
            _count: { _all: true },
            orderBy: { _count: { reviewerId: "desc" } },
            take: 1,
          })
          .catch(() => []),
    // missing_consent — apps in scope without a recorded consent.
    db.application
      .count({
        where: { workspaceId: wid, appliedAt: { gte: start, lte: end }, consentGivenAt: null },
      })
      .catch(() => 0),
  ]);

  // new_visitors — daily resolution is noisy, so we publish weekly+monthly only
  // per the spec.
  if (scope !== "today" && visitorsInScope.length > 0) {
    const cur = visitorsInScope.length;
    const prev = visitorsPrev.length;
    const deltaPct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
    const deltaText = deltaPct != null ? ` (${deltaPct >= 0 ? "↑" : "↓"}${Math.abs(deltaPct)}%)` : "";
    items.push({
      id: "new_visitors",
      source: "deterministic",
      severity: "info",
      icon: "Globe",
      text: `Career site had **${cur}** unique visitor${cur === 1 ? "" : "s"}${deltaText}.`,
      entities: [],
      href: "/analytics",
      scope,
      _at: nowMs,
      _magnitude: deltaPct != null ? Math.log10(Math.max(1, Math.abs(deltaPct))) : 0,
    });
  }

  // top_job_views — replaces the apps_per_job proxy when we have real data.
  if (topJobByViews.length && topJobByViews[0].jobId) {
    const top = topJobByViews[0];
    const job = await db.job.findUnique({ where: { id: top.jobId! }, select: { title: true } });
    if (job) {
      items.push({
        id: "top_job_views",
        source: "deterministic",
        severity: "info",
        icon: "Sparkle",
        text: `**${job.title}** had the most views — ${top._count._all}.`,
        entities: [{ kind: "job", id: top.jobId!, label: job.title }],
        href: `/jobs/${top.jobId}`,
        scope,
        _at: nowMs,
      });
    }
  }

  // low_apply_rate — per-job conversion outliers.
  const totalViews = viewsByJob.reduce((s, v) => s + v._count._all, 0);
  const totalApps = apsByJob.reduce((s, a) => s + a._count._all, 0);
  if (totalViews >= 20 && totalApps > 0) {
    const overallRate = totalApps / totalViews;
    const viewsMap = new Map(viewsByJob.map((v) => [v.jobId!, v._count._all]));
    const appsMap = new Map(apsByJob.map((a) => [a.jobId!, a._count._all]));
    for (const [jobId, views] of viewsMap) {
      if (views < 10) continue;
      const apps = appsMap.get(jobId) || 0;
      const rate = apps / views;
      // Flag when this job converts at <50% of the workspace average.
      if (overallRate > 0 && rate <= overallRate * 0.5) {
        const job = await db.job.findUnique({ where: { id: jobId }, select: { title: true } });
        if (!job) continue;
        items.push({
          id: `low_apply_rate_${jobId}`,
          source: "deterministic",
          severity: "warn",
          icon: "FileText",
          text: `**${job.title}** converts at ${(rate * 100).toFixed(1)}% vs your ${(overallRate * 100).toFixed(1)}% average — consider trimming the JD.`,
          entities: [{ kind: "job", id: jobId, label: job.title }],
          href: `/jobs/${jobId}`,
          scope,
          _at: nowMs,
          _magnitude: Math.log10(Math.max(1, (overallRate - rate) * 100)),
        });
        break; // one per recap; don't spam
      }
    }
  }

  // apply_dropoff — form_start without a matching apply_complete for the
  // same job (within the scope window). We approximate per-job: starts − completes.
  const startsByJob = await db.careerSiteEvent
    .groupBy({
      by: ["jobId"],
      where: { workspaceId: wid, kind: "form_start", jobId: { not: null }, createdAt: { gte: start, lte: end } },
      _count: { _all: true },
    })
    .catch(() => []);
  for (const sj of startsByJob) {
    const starts = sj._count._all;
    const completes = appsMap(apsByJob, sj.jobId);
    const dropoff = starts - completes;
    if (dropoff >= 10) {
      const job = await db.job.findUnique({ where: { id: sj.jobId! }, select: { title: true } });
      if (job) {
        items.push({
          id: `apply_dropoff_${sj.jobId}`,
          source: "deterministic",
          severity: "warn",
          icon: "FileText",
          text: `**${dropoff}** visitor${dropoff === 1 ? "" : "s"} started the apply form for ${job.title} but didn't submit.`,
          entities: [{ kind: "job", id: sj.jobId!, label: job.title }],
          href: `/jobs/${sj.jobId}`,
          scope,
          _at: nowMs,
          _magnitude: Math.log10(Math.max(1, dropoff)),
        });
        break; // surface the worst offender once
      }
    }
  }

  // stage_moves — total movement in scope, grouped by destination stage.
  if (stageMovesByPair.length > 0) {
    const total = stageMovesByPair.reduce((s, r) => s + r._count._all, 0);
    const hired = stageMovesByPair.find((r) => r.toStageKey === "hired")?._count._all || 0;
    const rejected = stageMovesByPair.find((r) => r.toStageKey === "rejected")?._count._all || 0;
    const advanced = total - hired - rejected;
    items.push({
      id: "stage_moves",
      source: "deterministic",
      severity: "info",
      icon: "Pipeline",
      text: `**${advanced}** advanced, ${rejected} rejected, ${hired} hired in scope.`,
      entities: [],
      href: "/pipeline",
      scope,
      _at: nowMs,
      _magnitude: Math.log10(Math.max(1, total)),
    });
  }

  // interview_outcomes — only fires when at least one debrief landed.
  if (interviewDebriefs.length > 0) {
    const positive = interviewDebriefs.filter((d) => d.sentiment === "positive").length;
    const negative = interviewDebriefs.filter((d) => d.sentiment === "negative").length;
    const mixed = interviewDebriefs.filter((d) => d.sentiment === "mixed").length;
    items.push({
      id: "interview_outcomes",
      source: "deterministic",
      severity: "info",
      icon: "Calendar",
      text: `**${interviewDebriefs.length}** interview debrief${interviewDebriefs.length === 1 ? "" : "s"} filed — ${positive} positive, ${negative} negative, ${mixed} mixed.`,
      entities: [],
      href: "/pipeline",
      scope,
      _at: nowMs,
    });
  }

  // sentiment_concerns_summary — surface a concern category that spikes
  // against its 90-day baseline. Weekly+monthly only — daily samples are
  // too small to be meaningful.
  if (scope !== "today" && sentimentRowsScope.length >= 5) {
    const sinceBaseline = new Date(nowMs - 90 * DAY);
    const baselineRows = await db.sentimentResult
      .findMany({
        where: { workspaceId: wid, createdAt: { gte: sinceBaseline } },
        select: { concerns: true },
      })
      .catch(() => []);
    const scopeConcerns = tallyConcerns(sentimentRowsScope.map((r) => r.concerns as unknown));
    const baselineConcerns = tallyConcerns(baselineRows.map((r) => r.concerns as unknown));
    const scopeTotal = sentimentRowsScope.length;
    const baselineTotal = Math.max(1, baselineRows.length);
    let topSpike: { concern: string; scopePct: number; baselinePct: number } | null = null;
    for (const [concern, n] of scopeConcerns) {
      const scopePct = Math.round((n / scopeTotal) * 100);
      const baselinePct = Math.round(((baselineConcerns.get(concern) || 0) / baselineTotal) * 100);
      if (scopePct >= baselinePct + 15 && scopePct >= 25) {
        if (!topSpike || scopePct - baselinePct > topSpike.scopePct - topSpike.baselinePct) {
          topSpike = { concern, scopePct, baselinePct };
        }
      }
    }
    if (topSpike) {
      items.push({
        id: "sentiment_concerns_summary",
        source: "deterministic",
        severity: "warn",
        icon: "Clock",
        text: `**${topSpike.scopePct}%** of replies flagged *${prettyConcern(topSpike.concern)}* (vs ${topSpike.baselinePct}% baseline).`,
        entities: [],
        href: "/inbox",
        scope,
        _at: nowMs,
        _magnitude: Math.log10(Math.max(1, topSpike.scopePct - topSpike.baselinePct)),
      });
    }
  }

  // review_load — heaviest individual reviewer's plate.
  if (reviewLoads.length > 0 && reviewLoads[0].reviewerId) {
    const reviewerId = reviewLoads[0].reviewerId;
    const count = reviewLoads[0]._count._all;
    if (count >= 5) {
      const u = await db.user.findUnique({
        where: { id: reviewerId },
        select: { id: true, name: true, email: true },
      });
      if (u) {
        const label = u.name || u.email;
        items.push({
          id: `review_load_${reviewerId}`,
          source: "deterministic",
          severity: count >= 15 ? "warn" : "info",
          icon: "Users",
          text: `**${label}** has ${count} candidate${count === 1 ? "" : "s"} assigned to review.`,
          entities: [{ kind: "user", id: u.id, label }],
          href: "/candidates",
          scope,
          _at: nowMs,
          _magnitude: Math.log10(Math.max(1, count)),
        });
      }
    }
  }

  // missing_consent — count applications in scope with no consent record.
  if (missingConsentCount > 0) {
    items.push({
      id: "missing_consent",
      source: "deterministic",
      severity: "warn",
      icon: "FileText",
      text: `**${missingConsentCount}** application${missingConsentCount === 1 ? "" : "s"} in scope ${missingConsentCount === 1 ? "is" : "are"} missing a GDPR consent record.`,
      entities: [],
      href: "/candidates",
      scope,
      _at: nowMs,
      _magnitude: Math.log10(Math.max(1, missingConsentCount)),
    });
  }

  return items;
}

function appsMap(apsByJob: { jobId: string | null; _count: { _all: number } }[], jobId: string | null): number {
  for (const a of apsByJob) {
    if (a.jobId === jobId) return a._count._all;
  }
  return 0;
}

function tallyConcerns(concernArrays: unknown[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of concernArrays) {
    if (!Array.isArray(row)) continue;
    for (const c of row) {
      if (typeof c !== "string") continue;
      out.set(c, (out.get(c) || 0) + 1);
    }
  }
  return out;
}

function prettyConcern(c: string): string {
  switch (c) {
    case "salary": return "salary";
    case "timing": return "timing";
    case "role_clarity": return "role clarity";
    case "process_length": return "process length";
    case "competing_offer": return "competing offers";
    case "relocation": return "relocation";
    default: return c.replace(/_/g, " ");
  }
}

function aggregateBySource(
  rows: { aiFit: number | null; candidate: { source: string | null } }[],
): { source: string; avg: number; n: number }[] {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    if (r.aiFit == null) continue;
    const src = r.candidate.source || "Other";
    const cur = acc.get(src) || { sum: 0, n: 0 };
    cur.sum += r.aiFit;
    cur.n += 1;
    acc.set(src, cur);
  }
  return Array.from(acc.entries()).map(([source, { sum, n }]) => ({
    source,
    avg: Math.round(sum / n),
    n,
  }));
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

// ── AI layer ─────────────────────────────────────────────────────────
type AIBuildResult = { items: RecapItem[]; error: boolean };

async function buildAI(
  workspaceId: string,
  scope: RecapScope,
  window: ScopeWindow,
  deterministic: RecapItem[],
  workspaceName: string,
): Promise<AIBuildResult> {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } });
  if (!ws) return { items: [], error: false };

  const cfg = await getAIConfig(workspaceId);
  const redact = cfg?.redactPII !== false; // default ON

  // Tone shapes the AI's voice — pulled from AIConfig.recapSettings.tone.
  // Defaults to "factual" for new workspaces.
  const recapSettings = (cfg?.recapSettings as Record<string, unknown> | null) || {};
  const tone: "factual" | "conversational" | "quirky" =
    recapSettings.tone === "conversational" || recapSettings.tone === "quirky"
      ? (recapSettings.tone as "conversational" | "quirky")
      : "factual";
  const suggestedActions = (cfg?.features as Record<string, boolean> | null)?.recapSuggestedActions === true;

  const { start, end, previousStart, previousEnd } = window;
  const [openJobs, topApplicants, sourceStats, prevApps] = await Promise.all([
    db.job.findMany({
      where: { workspaceId, status: "Open" },
      select: { id: true, title: true, applications: { where: { appliedAt: { gte: start, lte: end } }, select: { id: true, aiFit: true } } },
      take: 10,
    }),
    db.application.findMany({
      where: { workspaceId, appliedAt: { gte: start, lte: end }, aiFit: { gte: 80 } },
      include: { candidate: { select: { id: true, source: true } }, job: { select: { id: true, title: true } } },
      orderBy: { aiFit: "desc" },
      take: 5,
    }),
    db.candidate.groupBy({
      by: ["source"],
      where: { workspaceId, createdAt: { gte: start, lte: end } },
      _count: { _all: true },
    }),
    db.application.count({ where: { workspaceId, appliedAt: { gte: previousStart, lt: previousEnd } } }),
  ]);

  // Anonymize candidate ids when redaction is on. The renderer can't
  // re-link to the candidate page without the real id, but the LLM gets a
  // stable token it can refer to in the bullet.
  const anonMap = new Map<string, string>();
  const tokenize = (realId: string) => {
    if (!redact) return realId;
    if (!anonMap.has(realId)) anonMap.set(realId, `anon_${anonMap.size + 1}`);
    return anonMap.get(realId)!;
  };

  const totalApps = openJobs.reduce((s, j) => s + j.applications.length, 0);
  const baselines = {
    apps_in_scope: totalApps,
    apps_previous_scope: prevApps,
    apps_delta_pct: prevApps > 0 ? Math.round(((totalApps - prevApps) / prevApps) * 100) : null,
  };

  const payload = {
    workspace: { id: workspaceId, name: workspaceName, timezone: ws.timezone },
    scope: { kind: scope, start: start.toISOString(), end: end.toISOString() },
    baselines,
    jobs: openJobs.map((j) => ({
      id: j.id,
      title: j.title,
      apps_in_scope: j.applications.length,
      avg_fit_in_scope: j.applications.length
        ? Math.round(j.applications.reduce((s, a) => s + (a.aiFit || 0), 0) / j.applications.length)
        : null,
    })),
    top_applicants: topApplicants.map((t) => ({
      candidate_id: tokenize(t.candidateId),
      job_id: t.jobId,
      job_title: t.job.title,
      ai_fit: t.aiFit,
      source: t.candidate.source,
    })),
    sources: sourceStats.map((s) => ({ source: s.source, count: s._count._all })),
    deterministic_picks: deterministic.map((d) => ({ id: d.id, text: stripBold(d.text) })),
    redacted: redact,
  };

  const toneInstruction =
    tone === "conversational"
      ? "Tone: warm and conversational, like a colleague who actually read the data. Still specific, still factual."
      : tone === "quirky"
      ? "Tone: a little playful — a single tasteful emoji is allowed per bullet. Specific and factual still wins; never sacrifice accuracy for cuteness."
      : "Tone: factual, specific, useful. Name the entity. One concrete number per bullet when possible.";
  const actionsInstruction = suggestedActions
    ? '- You MAY end a bullet with a brief "Consider …" or "Worth …" suggestion when it follows obviously from the data.'
    : '- Do NOT prescribe actions ("consider doing X"). State the fact; let the human decide.';

  const system = [
    "You are Vellum's recap analyst. You write short briefings for a busy hiring team.",
    "",
    "Hard rules:",
    "- Use only facts present in CONTEXT. Never invent numbers, names, scores, dates, or trends.",
    "- 3 to 6 bullets, each ≤140 characters, no preamble.",
    "- Do NOT restate the deterministic_picks — add insight on top, never duplicate.",
    "- Never recommend rejecting or advancing a candidate.",
    "- Never reference age, gender, ethnicity, disability, family status, or any protected attribute.",
    actionsInstruction,
    "- Output strict JSON: {\"items\": [{\"text\": string, \"severity\": \"info\"|\"good\"|\"warn\", \"entity_id\"?: string, \"entity_kind\"?: \"candidate\"|\"job\"|\"source\"}], \"no_findings\"?: boolean}.",
    "- No prose outside JSON. If nothing stands out, return {\"items\": [], \"no_findings\": true}. Silence beats filler.",
    "",
    toneInstruction,
  ].join("\n");

  const user = `Generate the recap for ${workspaceName} (${scope}). CONTEXT:\n${JSON.stringify(payload, null, 2)}`;

  let result;
  try {
    result = await complete(workspaceId, system, user, { maxTokens: SCOPED_MAX_TOKENS[scope] });
  } catch {
    return { items: [], error: true };
  }
  if (result.mocked) {
    // Worker isn't actually wired to a real provider — surface to the UI so
    // we can show the "AI insights paused" notice.
    return { items: [], error: true };
  }

  const parsed = parseAIRecap(result.text);
  if (!parsed) {
    // Retry once with a stricter reminder, per spec §5 output contract.
    let retry;
    try {
      retry = await complete(
        workspaceId,
        system,
        user + "\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY the JSON object — no markdown fences, no commentary.",
        { maxTokens: SCOPED_MAX_TOKENS[scope] },
      );
    } catch {
      return { items: [], error: true };
    }
    const parsed2 = parseAIRecap(retry.text);
    if (!parsed2) return { items: [], error: true };
    return { items: itemsFromParsed(parsed2, scope, anonMap), error: false };
  }

  return { items: itemsFromParsed(parsed, scope, anonMap), error: false };
}

function itemsFromParsed(parsed: ParsedAI, scope: RecapScope, anonMap: Map<string, string>): RecapItem[] {
  // Reverse-resolve anon tokens so the click-through link points at the
  // real candidate (the AI never sees the real id, but the UI still works).
  const reverse = new Map<string, string>();
  for (const [real, anon] of anonMap) reverse.set(anon, real);

  return parsed.items.slice(0, 6).map((it, i): RecapItem => {
    const realId = it.entity_id && reverse.get(it.entity_id);
    const entityId = realId || it.entity_id;
    return {
      id: `ai_${i}_${Date.now()}`,
      source: "ai",
      severity: it.severity === "warn" ? "warn" : it.severity === "good" ? "good" : "info",
      icon: "Sparkle",
      text: it.text.slice(0, 200),
      entities: entityId && it.entity_kind
        ? [{ kind: it.entity_kind, id: entityId, label: it.entity_id || entityId }]
        : [],
      href:
        it.entity_kind === "job" && entityId ? `/jobs/${entityId}` :
        it.entity_kind === "candidate" && entityId ? `/candidates/${entityId}` :
        undefined,
      scope,
      _at: Date.now(),
    };
  });
}

function stripBold(text: string) {
  return text.replace(/\*\*/g, "");
}

type ParsedAI = {
  items: { text: string; severity?: "info" | "good" | "warn"; entity_id?: string; entity_kind?: "candidate" | "job" | "source" }[];
  no_findings?: boolean;
};

function parseAIRecap(text: string): ParsedAI | null {
  // Tolerant of ```json fences and trailing prose around the JSON.
  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  // If the model included prose before/after the JSON, try to extract the
  // first balanced { ... } block. Better than rejecting outright.
  if (!cleaned.startsWith("{")) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) cleaned = m[0];
  }
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed as ParsedAI;
  } catch {
    return null;
  }
}

// ── Ranking — score-based per §6 ─────────────────────────────────────
/**
 * score = base_severity_weight
 *       + recency_boost            // newer events score higher
 *       + magnitude_boost          // log-scaled |delta| vs baseline
 *       + audience_relevance       // entity owned by the recipient
 *       - duplication_penalty      // demote items sharing primary entity
 *
 * Always-include and always-exclude rules bypass the scoring math.
 *
 * `audienceContext` is optional — when present, items whose primary entity
 * is owned by or assigned to the recipient get a +1.5 boost. The cache
 * tick never passes it (we don't know the recipient yet); the dispatch
 * tick passes it per-recipient just before sending the email.
 */
export type AudienceContext = {
  recipientUserId?: string;
  ownedJobIds?: Set<string>;
  ownedCandidateIds?: Set<string>;
};

function rank(items: RecapItem[], scope: RecapScope, audience?: AudienceContext): RecapItem[] {
  const sevWeight: Record<RecapItem["severity"], number> = {
    celebrate: 4,
    warn: 3,
    good: 2,
    info: 1,
  };

  // Compute the recency boost as a normalised 0..1 of "freshness within the
  // scope window". Defaults to 0.5 when we don't know the underlying _at.
  const now = Date.now();
  const scopeMs = scope === "today" ? DAY : scope === "week" ? 7 * DAY : 30 * DAY;

  const seenEntities = new Map<string, number>();
  function dupKey(it: RecapItem) { return it.entities[0]?.id || it.id; }

  const scored = items.map((it) => {
    const recency = it._at ? Math.max(0, Math.min(1, 1 - (now - it._at) / scopeMs)) : 0.5;
    const magnitude = it._magnitude || 0;
    const dupCount = seenEntities.get(dupKey(it)) || 0;
    // Audience relevance — boost items whose primary entity the recipient
    // owns. Helps a hiring manager's digest surface "their" candidates
    // before someone else's.
    let audienceBoost = 0;
    if (audience) {
      for (const e of it.entities) {
        if (e.kind === "job" && audience.ownedJobIds?.has(e.id)) audienceBoost = 1.5;
        if (e.kind === "candidate" && audience.ownedCandidateIds?.has(e.id)) audienceBoost = 1.5;
        if (e.kind === "user" && audience.recipientUserId === e.id) audienceBoost = 1.5;
      }
    }
    const score = sevWeight[it.severity] + recency * 1.5 + magnitude * 0.8 + audienceBoost - dupCount * 2;
    seenEntities.set(dupKey(it), dupCount + 1);
    return { it, score };
  });

  // Pull always-include items out first, in original (severity, recency) order.
  const alwaysIncluded = scored
    .filter((s) => s.it._alwaysInclude)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.it);
  const ranked = scored
    .filter((s) => !s.it._alwaysInclude)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.it);

  // Dedupe — within combined list, keep first occurrence per entity.
  const seenKeys = new Set<string>();
  const result: RecapItem[] = [];
  for (const it of alwaysIncluded.concat(ranked)) {
    const k = dupKey(it);
    if (seenKeys.has(k)) continue;
    seenKeys.add(k);
    result.push(it);
  }

  const limit = RECAP_LIMITS[scope];
  return result.slice(0, limit);
}

function stripInternal(it: RecapItem): RecapItem {
  // Drop _alwaysInclude / _magnitude / _at before persistence — they're
  // internal to the ranker and shouldn't bloat the cached JSON.
  const { _alwaysInclude, _magnitude, _at, ...clean } = it;
  void _alwaysInclude; void _magnitude; void _at;
  return clean;
}
