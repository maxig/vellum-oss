// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Review queue — deterministic catalog + scoring + build/read helpers.
 *
 * See REVIEW_QUEUE_FEATURE.md for the spec. This module is the Phase-1
 * deterministic-only implementation: 5 buckets pulled from the prototype's
 * `computeBuckets()` in vellum-design/project/view-review-queue.jsx, plus
 * a rule engine (per-bucket toggles, thresholds, severity overrides) read
 * from `AIConfig.reviewRules`.
 *
 * Phase 2 will add the AI overlay in §5 of the spec — this file is set up
 * so the merge point (`buildReviewQueue` → `rank`) trivially accepts a
 * second source of items without restructuring.
 *
 * The cache shape lives in Prisma's `ReviewQueueCache`:
 *   ({ workspaceId, userId }) → { rulesHash, items, builtAt, refreshing, aiState }
 *
 * Everything below is pure-ish over Prisma reads. No HTTP, no React.
 */

import crypto from "node:crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { buildAIOverlay } from "@/lib/review-queue-ai";
import { isAIEnabled } from "@/lib/ai";
import { emit } from "@/lib/review-queue-telemetry";
import { logger } from "@/lib/log";

const log = logger("review-queue");

// ── Types ────────────────────────────────────────────────────────────

export type BucketId =
  | "no-reply"
  | "stale-applied"
  | "post-interview"
  | "schedule-needed"
  | "offer-pending"
  // Phase 2 additions live alongside Phase 1 so the rule engine can
  // already store toggles for them; they're not computed yet.
  | "missing-debrief"
  | "reference-overdue"
  | "long-cold-scorer"
  // Synthetic id used by AI items in Phase 2. Kept in the union so the
  // ReviewQueueItem type accepts it everywhere.
  | "ai";

export type BucketAction = "message" | "schedule" | "decide" | "nudge" | "complete";

export type BucketDef = {
  id: BucketId;
  label: string;
  shortLabel: string;
  color: string; // OKLCH string
  icon: string;  // Icons key
  action: BucketAction;
  defaultSeverity: 1 | 2 | 3 | 4 | 5;
  /** Subset of rule keys this bucket supports — drives the settings card. */
  thresholdKeys: string[];
};

export type ReviewQueueItem = {
  candidateId: string;
  applicationId: string;
  /** Reviewer assigned to the candidate's application, or null when no
   * one is assigned. One of three signals that put the item in a user's
   * "Mine" view (see applyScope). */
  applicationReviewerId: string | null;
  /** User IDs on the candidate's job's hiring team. Denormalized onto
   * each cached item so the read-time scope filter stays a single
   * Array.filter — no DB hit per row. */
  jobHiringTeamUserIds: string[];
  /** User IDs scheduled as interviewers on ANY of the candidate's
   * interviews. Denormalized for the same reason. */
  interviewerUserIds: string[];
  bucketId: BucketId;
  reason: string;
  urgent: boolean;
  severity: number;
  action: BucketAction;
  rank: number;
  candidate: {
    id: string;
    name: string;
    stage: string;       // stage key (applied | screen | interview | offer)
    stageName: string;
    stageColor: string;
    avatarSeed: string;
  };
};

export type ReviewRules = {
  buckets: Record<
    BucketId,
    {
      enabled: boolean;
      severity: 1 | 2 | 3 | 4 | 5;
      thresholds: Record<string, number>;
    }
  >;
  scope: "mine" | "workspace";
  aiOverlay: { enabled: boolean; maxItems: 1 | 2 | 3 | 4 };
};

export type ReviewQueueResult = {
  items: ReviewQueueItem[];
  builtAt: Date;
  rulesHash: string;
  aiState: "ok" | "disabled" | "error" | "empty";
  aiError: string | null;
  /** True when the cache row is older than CACHE_TTL_MS or rulesHash drifted. */
  stale: boolean;
  /** True when a build is currently writing this row. Callers should not
   * kick off another rebuild while this is true — see §8.3. */
  refreshing: boolean;
};

// ── Catalog ──────────────────────────────────────────────────────────

/**
 * The full Phase-1 + Phase-2 bucket catalog. Order is the de-duplication
 * priority order (first match wins when a candidate could appear in
 * multiple buckets). The deterministic catalog is exported even when a
 * bucket isn't computed yet so the settings card can render all of them.
 */
export const BUCKETS: BucketDef[] = [
  {
    id: "no-reply",
    label: "Awaiting your reply",
    shortLabel: "No reply",
    color: "oklch(60% 0.18 28)",
    icon: "Mail",
    action: "message",
    defaultSeverity: 5,
    thresholdKeys: [],
  },
  {
    id: "post-interview",
    label: "Interviewed — waiting for your decision",
    shortLabel: "Post-interview",
    color: "oklch(72% 0.14 280)",
    icon: "Pipeline",
    action: "decide",
    defaultSeverity: 5,
    thresholdKeys: ["interviewDecisionDays"],
  },
  {
    id: "offer-pending",
    label: "Offer extended — awaiting response",
    shortLabel: "Offer pending",
    color: "oklch(72% 0.15 80)",
    icon: "Heart",
    action: "nudge",
    defaultSeverity: 5,
    thresholdKeys: ["offerNudgeDays"],
  },
  {
    id: "stale-applied",
    label: "Applied — no response in 3+ days",
    shortLabel: "Stale applications",
    color: "oklch(70% 0.15 60)",
    icon: "Clock",
    action: "nudge",
    defaultSeverity: 4,
    thresholdKeys: ["staleAppliedDays"],
  },
  {
    id: "schedule-needed",
    label: "Moved to interview — no time booked yet",
    shortLabel: "Schedule needed",
    color: "var(--accent-solid)",
    icon: "Calendar",
    action: "schedule",
    defaultSeverity: 4,
    thresholdKeys: ["scheduleWindowDays"],
  },
  // Phase 2 — not yet computed, but their toggles render in settings.
  {
    id: "missing-debrief",
    label: "Interviewed — debrief missing",
    shortLabel: "Missing debrief",
    color: "oklch(66% 0.13 180)",
    icon: "FileText",
    action: "complete",
    defaultSeverity: 3,
    thresholdKeys: ["debriefSlaHours"],
  },
  {
    id: "reference-overdue",
    label: "Reference checks overdue",
    shortLabel: "Reference overdue",
    color: "oklch(66% 0.13 220)",
    icon: "Check",
    action: "complete",
    defaultSeverity: 3,
    thresholdKeys: ["referenceSlaDays"],
  },
  {
    id: "long-cold-scorer",
    label: "Strong fit but going cold",
    shortLabel: "Long-cold scorer",
    color: "oklch(70% 0.14 320)",
    icon: "Star",
    action: "message",
    defaultSeverity: 4,
    thresholdKeys: ["coldScorerMinScore", "coldScorerStageMult"],
  },
  // AI overlay items render under their own section header per spec §3
  // ("✨ AI noticed"). Listed LAST in this array so:
  //   - rankAndDedupe()'s tie-breaker pushes AI items below deterministic
  //     ones at the same rank (bucketOrder index is highest)
  //   - the sheet groups + chips them at the bottom of the catalog
  // The `action` value here is a placeholder; AI items carry their own
  // per-item action (constrained to message|schedule|complete in
  // review-queue-ai.ts).
  {
    id: "ai",
    label: "AI noticed",
    shortLabel: "AI noticed",
    color: "var(--accent-solid)",
    icon: "Sparkle",
    action: "message",
    defaultSeverity: 3,
    thresholdKeys: [],
  },
];

/** Buckets actually computed in Phase 1. Phase 2 will extend this array. */
const PHASE_1_BUCKETS: BucketId[] = [
  "no-reply",
  "post-interview",
  "offer-pending",
  "stale-applied",
  "schedule-needed",
];

const THRESHOLD_DEFAULTS: Record<string, number> = {
  staleAppliedDays: 3,
  interviewDecisionDays: 10,
  scheduleWindowDays: 5,
  offerNudgeDays: 3,
  debriefSlaHours: 24,
  referenceSlaDays: 5,
  coldScorerMinScore: 80,
  coldScorerStageMult: 2.0,
};

const THRESHOLD_RANGES: Record<string, { min: number; max: number; integer?: boolean }> = {
  staleAppliedDays: { min: 1, max: 14, integer: true },
  interviewDecisionDays: { min: 3, max: 30, integer: true },
  scheduleWindowDays: { min: 2, max: 14, integer: true },
  offerNudgeDays: { min: 1, max: 10, integer: true },
  debriefSlaHours: { min: 4, max: 72, integer: true },
  referenceSlaDays: { min: 1, max: 14, integer: true },
  coldScorerMinScore: { min: 50, max: 100, integer: true },
  coldScorerStageMult: { min: 1.0, max: 4.0 },
};

// ── Rule engine ──────────────────────────────────────────────────────

export function defaultRules(role: string): ReviewRules {
  const buckets = {} as ReviewRules["buckets"];
  for (const b of BUCKETS) {
    const thresholds: Record<string, number> = {};
    for (const k of b.thresholdKeys) thresholds[k] = THRESHOLD_DEFAULTS[k];
    // reference-overdue is off by default — see spec §4.7.
    const enabled = b.id !== "reference-overdue";
    buckets[b.id] = { enabled, severity: b.defaultSeverity, thresholds };
  }
  // ai always present in the buckets map so the settings UI can render its
  // row even when no items are computed yet.
  buckets.ai = { enabled: true, severity: 3, thresholds: {} };
  return {
    buckets,
    scope: role === "owner" || role === "admin" ? "workspace" : "mine",
    aiOverlay: { enabled: false, maxItems: 4 },
  };
}

/**
 * Merge persisted rules with the role-aware defaults. Persisted values
 * win; missing values fall back. Threshold values out of range snap back
 * to the default — the engine never trusts the database blindly.
 */
export function resolveRules(role: string, raw: unknown): ReviewRules {
  const defaults = defaultRules(role);
  const persisted = (raw && typeof raw === "object" ? (raw as Partial<ReviewRules>) : {}) || {};
  const buckets = { ...defaults.buckets };
  if (persisted.buckets && typeof persisted.buckets === "object") {
    for (const [id, override] of Object.entries(persisted.buckets) as [BucketId, Partial<ReviewRules["buckets"][BucketId]> | undefined][]) {
      if (!override || !buckets[id]) continue;
      const merged = { ...buckets[id] };
      if (typeof override.enabled === "boolean") merged.enabled = override.enabled;
      if (typeof override.severity === "number" && override.severity >= 1 && override.severity <= 5) {
        merged.severity = Math.round(override.severity) as 1 | 2 | 3 | 4 | 5;
      }
      if (override.thresholds && typeof override.thresholds === "object") {
        const thresholds = { ...merged.thresholds };
        for (const [tk, tv] of Object.entries(override.thresholds)) {
          const range = THRESHOLD_RANGES[tk];
          if (!range || typeof tv !== "number" || Number.isNaN(tv)) continue;
          if (tv < range.min || tv > range.max) continue;
          thresholds[tk] = range.integer ? Math.round(tv) : tv;
        }
        merged.thresholds = thresholds;
      }
      buckets[id] = merged;
    }
  }
  return {
    buckets,
    scope: persisted.scope === "mine" || persisted.scope === "workspace" ? persisted.scope : defaults.scope,
    aiOverlay: {
      enabled: typeof persisted.aiOverlay?.enabled === "boolean" ? persisted.aiOverlay.enabled : defaults.aiOverlay.enabled,
      maxItems:
        persisted.aiOverlay?.maxItems && [1, 2, 3, 4].includes(persisted.aiOverlay.maxItems)
          ? (persisted.aiOverlay.maxItems as 1 | 2 | 3 | 4)
          : defaults.aiOverlay.maxItems,
    },
  };
}

/** Stable hash of the rule set — drives cache invalidation on edit.
 *
 * `scope` is deliberately EXCLUDED. The cache holds the workspace-wide
 * item set; per-user scope is applied at read time (see
 * applyScope in this file + the GET handler). Including scope in the
 * hash would invalidate the cache whenever a user toggles "Mine ↔
 * Whole workspace", forcing a slow synchronous rebuild and — worse —
 * returning the previous scope's items as "stale" data while the
 * rebuild ran. Decoupling them means scope flips are instant and the
 * cache never holds scope-mismatched data.
 */
export function hashRules(rules: ReviewRules): string {
  const hashed = { buckets: rules.buckets, aiOverlay: rules.aiOverlay };
  const stable = JSON.stringify(hashed, Object.keys(hashed).sort());
  return crypto.createHash("sha1").update(stable).digest("hex").slice(0, 16);
}

// ── Public read helpers ──────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Read the cached queue for (workspace, user). Returns null if cold —
 * caller should fall back to a synchronous build.
 */
export async function readCachedQueue(
  workspaceId: string,
  userId: string,
  rulesHash: string,
): Promise<ReviewQueueResult | null> {
  const cached = await db.reviewQueueCache.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!cached) return null;
  const ageMs = Date.now() - cached.builtAt.getTime();
  const stale = ageMs > CACHE_TTL_MS || cached.rulesHash !== rulesHash;
  return {
    items: cached.items as unknown as ReviewQueueItem[],
    builtAt: cached.builtAt,
    rulesHash: cached.rulesHash,
    aiState: (cached.aiState as ReviewQueueResult["aiState"]) || "disabled",
    aiError: cached.aiError,
    stale,
    refreshing: cached.refreshing,
  };
}

/**
 * In-process Promise dedupe for concurrent buildReviewQueue calls
 * targeting the same (workspace, user). Two callers arriving in the
 * same event-loop tick (e.g. topbar count fetch + sheet open) share
 * one running build instead of each spawning their own. Promoting to a
 * real lock (advisory lock, Redis SETNX) becomes worthwhile only at
 * multi-replica deploy time.
 */
const inFlightBuilds = new Map<string, Promise<ReviewQueueResult>>();

function keyFor(workspaceId: string, userId: string) {
  return `${workspaceId}/${userId}`;
}

/**
 * Run buildReviewQueue but coalesce concurrent calls for the same
 * (workspace, user) into a single Promise. Awaiting callers all
 * resolve with the same result; fire-and-forget callers don't
 * duplicate the work either.
 */
export function buildReviewQueueDeduped(ctx: {
  workspaceId: string;
  userId: string;
}): Promise<ReviewQueueResult> {
  const key = keyFor(ctx.workspaceId, ctx.userId);
  const existing = inFlightBuilds.get(key);
  if (existing) return existing;
  const promise = buildReviewQueue(ctx).finally(() => inFlightBuilds.delete(key));
  inFlightBuilds.set(key, promise);
  return promise;
}

/**
 * Fire-and-forget rebuild. Returns true if this call actually spawned
 * a new build, false if it was coalesced into an in-flight one.
 */
export function tryScheduleBackgroundBuild(workspaceId: string, userId: string): boolean {
  const key = keyFor(workspaceId, userId);
  const alreadyRunning = inFlightBuilds.has(key);
  // Always call buildReviewQueueDeduped — it'll either spawn or share.
  // We only care about the "was it new?" answer for telemetry/callers.
  buildReviewQueueDeduped({ workspaceId, userId }).catch((e) =>
    log.warn(`background rebuild failed (${key}):`, (e as Error).message),
  );
  return !alreadyRunning;
}

/**
 * Apply per-user scope to a workspace-wide item set. Called at read
 * time by the GET / refresh handlers.
 *
 *   workspace → all items pass through
 *   mine      → items where ANY of the three "I'm involved" signals
 *               matches the current user:
 *                 1. They're the assigned reviewer on the application
 *                 2. They're on the job's hiring team
 *                 3. They're an interviewer on at least one of the
 *                    candidate's interviews
 *
 *   See REVIEW_QUEUE_FEATURE.md §6.2 and ROLES.md for the spec.
 */
export function applyScope(
  items: ReviewQueueItem[],
  scope: "mine" | "workspace",
  userId: string,
): ReviewQueueItem[] {
  if (scope === "workspace") return items;
  return items.filter(
    (it) =>
      it.applicationReviewerId === userId ||
      it.jobHiringTeamUserIds.includes(userId) ||
      it.interviewerUserIds.includes(userId),
  );
}

/**
 * Resolve a user's effective scope: their UserPreference.reviewScope
 * override if set, else the workspace default from rules.
 */
export async function resolveEffectiveScope(
  userId: string,
  fallback: "mine" | "workspace",
): Promise<"mine" | "workspace"> {
  const prefs = await db.userPreference.findUnique({
    where: { userId },
    select: { reviewScope: true },
  });
  if (prefs?.reviewScope === "mine" || prefs?.reviewScope === "workspace") {
    return prefs.reviewScope;
  }
  return fallback;
}

/**
 * Build the review queue from scratch. Pure read-and-compute. Writes the
 * result to the cache table. Phase 1 is deterministic only; the AI
 * overlay slot is wired but produces no items yet.
 */
export async function buildReviewQueue(ctx: {
  workspaceId: string;
  userId: string;
}): Promise<ReviewQueueResult> {
  const { workspaceId, userId } = ctx;

  const [membership, cfg] = await Promise.all([
    db.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } }),
    db.aIConfig.findUnique({ where: { workspaceId }, select: { reviewRules: true } }),
  ]);
  const role = membership?.role || "member";

  // Scope is intentionally NOT considered here. The build computes a
  // single workspace-wide item set; scope is applied at read time so
  // toggling Mine ↔ Whole workspace never invalidates the cache or
  // forces a rebuild.
  const rules = resolveRules(role, cfg?.reviewRules);
  const rulesHash = hashRules(rules);

  // Mark `refreshing: true` if a row already exists. We deliberately do
  // NOT create a placeholder row with `items: []` on cold start — that
  // would let a concurrent GET read a fresh-but-empty row and render
  // "Inbox zero" while the real build was still running. updateMany
  // no-ops cleanly when the row doesn't exist; the in-process Promise
  // map handles dedupe between concurrent cold-start callers.
  await db.reviewQueueCache.updateMany({
    where: { workspaceId, userId },
    data: { refreshing: true },
  });

  const deterministic = await computeDeterministicItems(workspaceId, rules);

  // AI overlay — only runs when (1) the per-workspace overlay toggle is
  // on AND (2) the workspace has AI provisioned at all (key/baseUrl set
  // and not muted via the global AI features map). Both gates per
  // REVIEW_QUEUE_FEATURE.md §5.
  let aiItems: ReviewQueueItem[] = [];
  let aiState: ReviewQueueResult["aiState"] = "disabled";
  let aiError: string | null = null;
  if (rules.aiOverlay.enabled) {
    const aiOn = await isAIEnabled(workspaceId, "review_queue");
    if (!aiOn) {
      aiState = "disabled";
    } else {
      const aiStartedAt = Date.now();
      try {
        const overlayResult = await buildAIOverlay({
          workspaceId,
          maxItems: rules.aiOverlay.maxItems,
          deterministic,
        });
        aiItems = overlayResult.items;
        aiState = overlayResult.state;
        aiError = overlayResult.error;
      } catch (e) {
        aiState = "error";
        aiError = (e as Error).message;
        log.warn(`AI overlay failed (${workspaceId}/${userId}):`, aiError);
      }
      emit("review_queue.ai_overlay", {
        workspaceId,
        userId,
        state: aiState,
        itemCount: aiItems.length,
        durationMs: Date.now() - aiStartedAt,
      });
    }
  }

  const items = rankAndDedupe(deterministic.concat(aiItems));
  const builtAt = new Date();

  await db.reviewQueueCache.upsert({
    where: { workspaceId_userId: { workspaceId, userId } },
    create: {
      workspaceId,
      userId,
      rulesHash,
      items: items as unknown as Prisma.InputJsonValue,
      refreshing: false,
      aiState,
      builtAt,
    },
    update: {
      rulesHash,
      items: items as unknown as Prisma.InputJsonValue,
      refreshing: false,
      aiState,
      aiError,
      builtAt,
    },
  });

  return { items, builtAt, rulesHash, aiState, aiError, stale: false, refreshing: false };
}

// ── Deterministic computation ────────────────────────────────────────

type LoadedApplication = Prisma.ApplicationGetPayload<{
  include: {
    candidate: true;
    stage: true;
    job: { include: { hiringTeam: { select: { userId: true } } } };
    interviews: {
      include: {
        debrief: true;
        participants: { select: { userId: true } };
      };
    };
  };
}>;

async function computeDeterministicItems(
  workspaceId: string,
  rules: ReviewRules,
): Promise<ReviewQueueItem[]> {
  const applications = await loadApplications(workspaceId);
  if (applications.length === 0) return [];

  // One thread lookup per workspace, keyed by candidate id. Threads
  // belong to candidates not applications, so a candidate with two open
  // applications shares the same thread for our reply-pending check.
  const candidateIds = applications.map((a) => a.candidateId);
  const threads = await db.thread.findMany({
    where: { workspaceId, candidateId: { in: candidateIds } },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  const threadByCandidate = new Map<string, (typeof threads)[number]>();
  for (const t of threads) {
    // Keep the most-recently-active thread per candidate.
    const prev = threadByCandidate.get(t.candidateId);
    if (!prev || prev.lastAt < t.lastAt) threadByCandidate.set(t.candidateId, t);
  }

  // Workspace median time-in-stage per stage key — used by long-cold-scorer.
  // Cheap derivation: median of `updatedAt - appliedAt` across the loaded
  // applications, bucketed by stage key. Falls back to a sensible default
  // when the workspace doesn't have enough signal to compute one (< 3
  // applications per stage). Computing inline avoids a second DB roundtrip.
  const stageMedians = computeStageMedians(applications);

  const out: ReviewQueueItem[] = [];
  const now = Date.now();

  for (const app of applications) {
    if (!app.stage) continue;
    const stageKey = app.stage.key;
    if (stageKey === "hired" || stageKey === "rejected") continue;

    const item = matchBucket(
      app,
      stageKey,
      threadByCandidate.get(app.candidateId),
      rules,
      now,
      stageMedians,
    );
    if (item) out.push(item);
  }

  return out;
}

/**
 * Returns a Map<stageKey, medianDays>. Used by long-cold-scorer (§4.8) to
 * decide whether a candidate is "long" stuck. We compute this from the
 * same set of applications we already loaded — no second query.
 */
function computeStageMedians(apps: LoadedApplication[]): Map<string, number> {
  const buckets = new Map<string, number[]>();
  for (const a of apps) {
    if (!a.stage) continue;
    const days = (a.updatedAt.getTime() - a.appliedAt.getTime()) / 86_400_000;
    // Filter out negatives (clock skew) and zeros (never moved) — they
    // skew the median toward "everything is fast" and surface false
    // positives in long-cold-scorer.
    if (days <= 0) continue;
    if (!buckets.has(a.stage.key)) buckets.set(a.stage.key, []);
    buckets.get(a.stage.key)!.push(days);
  }
  const out = new Map<string, number>();
  for (const [k, arr] of buckets) {
    if (arr.length < 3) continue; // not enough signal
    arr.sort((a, b) => a - b);
    const mid = arr.length >> 1;
    out.set(k, arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2);
  }
  return out;
}

function matchBucket(
  app: LoadedApplication,
  stageKey: string,
  thread: { messages: { direction: string; createdAt: Date }[] } | undefined,
  rules: ReviewRules,
  now: number,
  stageMedians: Map<string, number>,
): ReviewQueueItem | null {
  const lastMsg = thread?.messages?.[0];
  const candidateReplied = lastMsg?.direction === "in";
  const daysSinceApplied = (now - app.appliedAt.getTime()) / 86_400_000;
  const daysInStage = (now - app.updatedAt.getTime()) / 86_400_000;

  // 4.1 — Awaiting your reply. Highest-priority deterministic bucket.
  if (candidateReplied && rules.buckets["no-reply"].enabled) {
    const hoursSinceReply = lastMsg ? (now - lastMsg.createdAt.getTime()) / 3_600_000 : 0;
    const firstName = app.candidate.name.split(" ")[0] || app.candidate.name;
    return makeItem({
      app,
      stageKey,
      bucket: "no-reply",
      rules,
      reason: `${firstName} replied ${relativeTime(lastMsg!.createdAt)} — they're waiting on you.`,
      urgent: hoursSinceReply > 24,
    });
  }

  // 4.5 — Offer pending. Checked before stale checks because offers are
  // the most urgent passive state.
  if (stageKey === "offer" && rules.buckets["offer-pending"].enabled) {
    const threshold = rules.buckets["offer-pending"].thresholds.offerNudgeDays ?? THRESHOLD_DEFAULTS.offerNudgeDays;
    if (daysInStage >= threshold) {
      return makeItem({
        app,
        stageKey,
        bucket: "offer-pending",
        rules,
        reason: `Offer extended ${relativeTime(app.updatedAt)}. Hasn't responded yet.`,
        urgent: daysInStage > threshold * 1.7,
      });
    }
  }

  // 4.3 — Post-interview decision: in interview stage > threshold days.
  if (stageKey === "interview" && rules.buckets["post-interview"].enabled) {
    const threshold = rules.buckets["post-interview"].thresholds.interviewDecisionDays ?? THRESHOLD_DEFAULTS.interviewDecisionDays;
    if (daysInStage >= threshold) {
      return makeItem({
        app,
        stageKey,
        bucket: "post-interview",
        rules,
        reason: `In interview for ${Math.floor(daysInStage)}d — past your team's ${threshold}d threshold.`,
        urgent: daysInStage > threshold * 1.5,
      });
    }
  }

  // 4.4 — Schedule needed: interview stage, no interview record yet.
  if (stageKey === "interview" && rules.buckets["schedule-needed"].enabled) {
    const threshold = rules.buckets["schedule-needed"].thresholds.scheduleWindowDays ?? THRESHOLD_DEFAULTS.scheduleWindowDays;
    if (daysInStage <= threshold && app.interviews.length === 0) {
      return makeItem({
        app,
        stageKey,
        bucket: "schedule-needed",
        rules,
        reason: `Moved to interview ${relativeTime(app.updatedAt)}. No calendar invite sent.`,
        urgent: false,
      });
    }
  }

  // 4.2 — Stale applications: applied stage, > threshold days, no thread.
  if (stageKey === "applied" && rules.buckets["stale-applied"].enabled) {
    const threshold = rules.buckets["stale-applied"].thresholds.staleAppliedDays ?? THRESHOLD_DEFAULTS.staleAppliedDays;
    if (daysSinceApplied >= threshold && !thread) {
      return makeItem({
        app,
        stageKey,
        bucket: "stale-applied",
        rules,
        reason: `Applied ${relativeTime(app.appliedAt)}. No outreach yet.`,
        urgent: daysSinceApplied > threshold * 1.7,
      });
    }
  }

  // 4.6 — Missing debrief. An interview ended ≥ debriefSlaHours ago but
  // no InterviewDebrief was recorded. We surface the candidate (not the
  // interview row) so the queue item shape stays uniform with the rest
  // of the catalog.
  if (rules.buckets["missing-debrief"].enabled) {
    const slaHours = rules.buckets["missing-debrief"].thresholds.debriefSlaHours ?? THRESHOLD_DEFAULTS.debriefSlaHours;
    const slaMs = slaHours * 3_600_000;
    // Find the most recent interview that ended (scheduled + duration in
    // the past) and has no debrief attached. `Interview.status === "done"`
    // is the strongest signal but we also accept "scheduled" interviews
    // whose end time is past, to cover teams that don't flip the status.
    const candidate = app.interviews
      .filter((iv) => {
        if (iv.debrief) return false;
        const endMs = iv.scheduledAt.getTime() + iv.durationMin * 60_000;
        return now - endMs > slaMs && iv.status !== "cancelled" && iv.status !== "no_show";
      })
      .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())[0];
    if (candidate) {
      const hours = Math.round((now - (candidate.scheduledAt.getTime() + candidate.durationMin * 60_000)) / 3_600_000);
      return makeItem({
        app,
        stageKey,
        bucket: "missing-debrief",
        rules,
        reason: `Interviewed ${relativeTime(candidate.scheduledAt)} — debrief still missing (${hours}h overdue).`,
        urgent: hours > slaHours * 3,
      });
    }
  }

  // 4.8 — Long-cold high scorer. Strong AI fit but stagnant in an early
  // stage. Uses the workspace median for the relevant stage as the basis
  // for "long" — falls back to a constant when the workspace doesn't
  // have enough signal yet (computeStageMedians returns < 3-sample
  // entries as undefined).
  if (
    rules.buckets["long-cold-scorer"].enabled &&
    (stageKey === "applied" || stageKey === "screen") &&
    typeof app.aiFit === "number"
  ) {
    const minScore = rules.buckets["long-cold-scorer"].thresholds.coldScorerMinScore ?? THRESHOLD_DEFAULTS.coldScorerMinScore;
    const mult = rules.buckets["long-cold-scorer"].thresholds.coldScorerStageMult ?? THRESHOLD_DEFAULTS.coldScorerStageMult;
    const median = stageMedians.get(stageKey) ?? 7; // 7d fallback for cold-start workspaces
    const lastMsgAgo = lastMsg ? (now - lastMsg.createdAt.getTime()) / 86_400_000 : daysSinceApplied;
    if (app.aiFit >= minScore && daysInStage > median * mult && lastMsgAgo > 7) {
      return makeItem({
        app,
        stageKey,
        bucket: "long-cold-scorer",
        rules,
        reason: `Strong fit (${app.aiFit}/100) but cold for ${Math.floor(daysInStage)}d in ${app.stage?.name?.toLowerCase() || stageKey}.`,
        urgent: false,
      });
    }
  }

  // 4.7 — Reference check overdue. The schema doesn't yet model
  // reference checks, so we keep this bucket's UI affordance (settings
  // toggle + chip) but the predicate is a no-op until the data model
  // catches up. Tracked in REVIEW_QUEUE_FEATURE.md §14.
  void rules.buckets["reference-overdue"];

  void PHASE_1_BUCKETS;
  return null;
}

function makeItem(opts: {
  app: LoadedApplication;
  stageKey: string;
  bucket: BucketId;
  rules: ReviewRules;
  reason: string;
  urgent: boolean;
}): ReviewQueueItem {
  const { app, stageKey, bucket, rules, reason, urgent } = opts;
  const def = BUCKETS.find((b) => b.id === bucket)!;
  const severity = rules.buckets[bucket].severity;
  // Collect every userId that should put this item into someone's
  // "Mine" view. De-dupe across all interviews — same person on three
  // interviews still counts once.
  const interviewerIds = Array.from(
    new Set(app.interviews.flatMap((iv) => iv.participants.map((p) => p.userId))),
  );
  const hiringTeamIds = app.job.hiringTeam.map((m) => m.userId);

  return {
    candidateId: app.candidateId,
    applicationId: app.id,
    applicationReviewerId: app.reviewerId,
    jobHiringTeamUserIds: hiringTeamIds,
    interviewerUserIds: interviewerIds,
    bucketId: bucket,
    reason,
    urgent,
    severity,
    action: def.action,
    rank: 0, // filled in by rankAndDedupe()
    candidate: {
      id: app.candidate.id,
      name: app.candidate.name,
      stage: stageKey,
      stageName: app.stage?.name || stageKey,
      stageColor: app.stage?.color || "var(--accent-solid)",
      avatarSeed: app.candidate.name,
    },
  };
}

// ── Loading ──────────────────────────────────────────────────────────

async function loadApplications(workspaceId: string): Promise<LoadedApplication[]> {
  // Always load workspace-wide — scope is applied at read time so the
  // cache holds a superset both "Mine" and "Whole workspace" can be
  // filtered from. See applyScope() and the GET handler.
  return db.application.findMany({
    where: {
      workspaceId,
      archived: false,
    },
    include: {
      candidate: true,
      stage: true,
      // Denormalize the job's hiring-team user IDs onto each item at
      // build time so the read-time Mine filter is array-membership, not
      // a per-item DB query.
      job: { include: { hiringTeam: { select: { userId: true } } } },
      // Same for interview participants — Mine includes anyone scheduled
      // as an interviewer on any of the candidate's interviews.
      interviews: {
        include: {
          debrief: true,
          participants: { select: { userId: true } },
        },
      },
    },
    take: 500,
    orderBy: { updatedAt: "desc" },
  });
}

// ── Ranking & dedupe ─────────────────────────────────────────────────

const MAX_ITEMS = 50;
const PER_BUCKET_CAP = 15;

/**
 * Score every item, sort by rank, then drop duplicate candidates
 * (earliest bucket priority wins) and enforce per-bucket + global caps.
 */
function rankAndDedupe(items: ReviewQueueItem[]): ReviewQueueItem[] {
  const bucketOrder = new Map(BUCKETS.map((b, i) => [b.id, i]));
  const scored = items.map((it) => ({
    ...it,
    rank: scoreItem(it),
  }));
  // Sort by rank desc, then by bucket priority asc (lower index = higher
  // priority in §4 order).
  scored.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    const ai = bucketOrder.get(a.bucketId) ?? 99;
    const bi = bucketOrder.get(b.bucketId) ?? 99;
    return ai - bi;
  });

  const seenCandidates = new Set<string>();
  const perBucket = new Map<BucketId, number>();
  const kept: ReviewQueueItem[] = [];
  for (const it of scored) {
    if (seenCandidates.has(it.candidateId)) continue;
    const count = perBucket.get(it.bucketId) ?? 0;
    if (count >= PER_BUCKET_CAP) continue;
    seenCandidates.add(it.candidateId);
    perBucket.set(it.bucketId, count + 1);
    kept.push(it);
    if (kept.length >= MAX_ITEMS) break;
  }
  return kept;
}

function scoreItem(it: ReviewQueueItem): number {
  let r = it.severity * 10;
  if (it.urgent) r += 5;
  if (it.candidate.stage === "interview" || it.candidate.stage === "offer") r += 3;
  // AI items capped at severity 3 (per spec §5) — additional defensive
  // ceiling so even a high-severity AI item lands below an Urgent
  // deterministic 5.
  if (it.bucketId === "ai") r = Math.min(r, 35);
  return r;
}

// ── Utilities ────────────────────────────────────────────────────────

function relativeTime(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** Item-level optimistic removal — called from the inline-action endpoint. */
export async function markItemDone(
  workspaceId: string,
  userId: string,
  candidateId: string,
): Promise<number> {
  const cached = await db.reviewQueueCache.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!cached) return 0;
  const items = cached.items as unknown as ReviewQueueItem[];
  const next = items.filter((it) => it.candidateId !== candidateId);
  if (next.length === items.length) return 0;
  await db.reviewQueueCache.update({
    where: { workspaceId_userId: { workspaceId, userId } },
    data: { items: next as unknown as Prisma.InputJsonValue },
  });
  return items.length - next.length;
}

/** Bump every cache row in a workspace — called when rules change. */
export async function invalidateWorkspaceCache(workspaceId: string): Promise<number> {
  // We don't delete the cached items — we just clear the rulesHash so
  // every reader sees `stale: true` and the next worker tick rebuilds.
  // Keeps the queue rendering instantly with stale content during the
  // refresh window rather than going blank.
  const result = await db.reviewQueueCache.updateMany({
    where: { workspaceId },
    data: { rulesHash: "" },
  });
  return result.count;
}

/** Total candidate-eligible user pairs for the worker to iterate. */
export async function eligibleUsersForBuild(workspaceId: string): Promise<string[]> {
  // Phase 1: every workspace member with at least one workspace-scoped
  // open application or one assigned-to-them application. Cheaper than
  // building a queue for users with zero candidates.
  const members = await db.membership.findMany({
    where: { workspaceId },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}
