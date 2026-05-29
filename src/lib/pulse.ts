// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// lib/pulse.ts — Candidate Engagement Signal
//
// Implements the scoring model defined in PULSE_FEATURE.md. The score is a
// time-decayed weighted sum of signals, clamped to [0, 100] and anchored to
// a per-stage baseline.
//
// Reads from PulseSignal (immutable event log) and writes the aggregate to
// the Candidate row (pulseScore / pulseBand / pulseUpdatedAt).

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// ── Types ────────────────────────────────────────────────────────────
export type PulseBand = "hot" | "warm" | "cool" | "cold" | "silent" | "locked";

export type PulseSignalKind =
  | "message_received"
  | "message_fast_reply"
  | "message_long_reply"
  | "positive_sentiment"
  | "question_asked"
  | "link_clicked"
  | "email_opened"
  | "career_site_revisit"
  | "no_reply_overdue"
  | "no_open"
  | "stage_idle"
  | "negative_sentiment"
  | "reschedule_requested"
  | "interview_no_show"
  | "unsubscribe"
  | "stage_advanced"
  | "offer_sent";

export type PulseSignalRecord = {
  id: string;
  kind: PulseSignalKind;
  polarity: "pos" | "neg";
  weight: number;
  source: string;
  evidence: Record<string, unknown>;
  at: Date;
};

export type PulseBreakdown = {
  candidateId: string;
  score: number;
  band: PulseBand;
  baseline: number;
  updatedAt: Date | null;
  signals: PulseSignalRecord[];
  sparkline: number[]; // last 14 days, oldest first
};

// ── Signal weights & polarity ────────────────────────────────────────
// Base weights; the actual contribution is `weight × decay(age)`.
const SIGNAL_DEFS: Record<
  PulseSignalKind,
  { polarity: "pos" | "neg"; weight: number; halfLifeDays: number }
> = {
  message_received: { polarity: "pos", weight: 8, halfLifeDays: 7 },
  message_fast_reply: { polarity: "pos", weight: 6, halfLifeDays: 7 },
  message_long_reply: { polarity: "pos", weight: 4, halfLifeDays: 7 },
  positive_sentiment: { polarity: "pos", weight: 6, halfLifeDays: 14 },
  question_asked: { polarity: "pos", weight: 3, halfLifeDays: 7 },
  link_clicked: { polarity: "pos", weight: 5, halfLifeDays: 7 },
  email_opened: { polarity: "pos", weight: 2, halfLifeDays: 5 },
  career_site_revisit: { polarity: "pos", weight: 3, halfLifeDays: 7 },

  no_reply_overdue: { polarity: "neg", weight: 7, halfLifeDays: 7 },
  no_open: { polarity: "neg", weight: 4, halfLifeDays: 5 },
  stage_idle: { polarity: "neg", weight: 3, halfLifeDays: 7 },
  negative_sentiment: { polarity: "neg", weight: 8, halfLifeDays: 14 },
  reschedule_requested: { polarity: "neg", weight: 4, halfLifeDays: 14 },
  interview_no_show: { polarity: "neg", weight: 10, halfLifeDays: 30 },
  unsubscribe: { polarity: "neg", weight: 100, halfLifeDays: 365 }, // terminal

  stage_advanced: { polarity: "pos", weight: 0, halfLifeDays: 1 }, // reset event
  offer_sent: { polarity: "pos", weight: 0, halfLifeDays: 1 }, // reset event
};

// Per-stage baseline anchor. These are the workspace defaults; in a richer
// version they'd live in AIConfig or a per-workspace settings JSON.
const STAGE_BASELINE: Record<string, number> = {
  applied: 60,
  screen: 65,
  interview: 70,
  offer: 75,
  hired: 90,
  rejected: 0,
};
const DEFAULT_BASELINE = 60;

// Bands — see PULSE_FEATURE.md §3.
function bandFor(score: number, locked: boolean): PulseBand {
  if (locked) return "locked";
  if (score >= 75) return "hot";
  if (score >= 55) return "warm";
  if (score >= 35) return "cool";
  if (score >= 15) return "cold";
  return "silent";
}

// Pretty labels + colors for the pill. The renderer uses these so the
// styling stays consistent across surfaces (candidates table, kanban,
// profile sheet, inbox).
export const BAND_META: Record<
  PulseBand,
  { label: string; dot: string; emoji: string; tint: string }
> = {
  hot: { label: "Hot", dot: "oklch(70% 0.18 28)", emoji: "🔥", tint: "color-mix(in oklab, oklch(70% 0.18 28) 14%, transparent)" },
  warm: { label: "Warm", dot: "oklch(72% 0.13 80)", emoji: "☀", tint: "color-mix(in oklab, oklch(72% 0.13 80) 12%, transparent)" },
  cool: { label: "Cool", dot: "oklch(72% 0.12 230)", emoji: "🌤", tint: "color-mix(in oklab, oklch(72% 0.12 230) 12%, transparent)" },
  cold: { label: "Cold", dot: "oklch(60% 0.16 28)", emoji: "❄️", tint: "color-mix(in oklab, oklch(60% 0.16 28) 14%, transparent)" },
  silent: { label: "Silent", dot: "oklch(70% 0.02 250)", emoji: "💤", tint: "var(--glass-bg-faint)" },
  locked: { label: "Withdrew", dot: "oklch(50% 0.02 250)", emoji: "✖", tint: "var(--glass-bg-faint)" },
};

// ── Recording ────────────────────────────────────────────────────────
/**
 * Append a signal to the candidate's event log and trigger a recompute.
 * Cheap to call from request handlers; the recompute is in-process.
 *
 * Returns `null` if the candidate is locked (unsubscribe), so callers
 * don't have to special-case the lock.
 *
 * Honors the workspace's `features.pulse` toggle — when off, signals are
 * silently dropped. The toggle is independent of `features.pulseSentiment`,
 * which only gates the AI sentiment classifier (a sub-feature of Pulse).
 */
export async function recordSignal(args: {
  workspaceId: string;
  candidateId: string;
  kind: PulseSignalKind;
  source?: string;
  evidence?: Record<string, unknown>;
  at?: Date;
}): Promise<{ score: number; band: PulseBand } | null> {
  const def = SIGNAL_DEFS[args.kind];
  if (!def) return null;

  // Workspace-level Pulse toggle. Default is ON unless explicitly disabled.
  const cfg = await db.aIConfig.findUnique({
    where: { workspaceId: args.workspaceId },
    select: { features: true },
  });
  if (cfg) {
    const features = (cfg.features as Record<string, boolean> | null) || {};
    if (features.pulse === false) return null;
  }

  // Don't keep recording on locked candidates; the score is frozen.
  const c = await db.candidate.findFirst({
    where: { id: args.candidateId, workspaceId: args.workspaceId },
    select: { pulseBand: true },
  });
  if (!c) return null;
  if (c.pulseBand === "locked" && args.kind !== "unsubscribe") return null;

  await db.pulseSignal.create({
    data: {
      workspaceId: args.workspaceId,
      candidateId: args.candidateId,
      kind: args.kind,
      polarity: def.polarity,
      weight: def.weight,
      source: args.source || "system",
      evidence: (args.evidence || {}) as Prisma.InputJsonValue,
      at: args.at || new Date(),
    },
  });

  return recomputePulse(args.workspaceId, args.candidateId);
}

// ── Scoring ──────────────────────────────────────────────────────────
function decay(ageMs: number, halfLifeDays: number): number {
  const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;
  return Math.pow(2, -ageMs / halfLifeMs);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Recompute and persist the cached score for one candidate.
 * Returns the new score+band; callers can use it directly (we don't make
 * them re-read the candidate row).
 */
export async function recomputePulse(
  workspaceId: string,
  candidateId: string,
): Promise<{ score: number; band: PulseBand }> {
  const now = Date.now();
  const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);

  // We need: the signal log (last 60d), the current stage (for baseline),
  // and any unsubscribe lock.
  const [signals, app] = await Promise.all([
    db.pulseSignal.findMany({
      where: { workspaceId, candidateId, at: { gte: sixtyDaysAgo } },
      orderBy: { at: "desc" },
    }),
    db.application.findFirst({
      where: { workspaceId, candidateId, archived: false },
      include: { stage: true },
      orderBy: { appliedAt: "desc" },
    }),
  ]);

  const locked = signals.some((s) => s.kind === "unsubscribe");
  const stageKey = app?.stage?.key || "applied";
  const baseline = STAGE_BASELINE[stageKey] ?? DEFAULT_BASELINE;

  let score = baseline;
  if (!locked) {
    for (const s of signals) {
      const def = SIGNAL_DEFS[s.kind as PulseSignalKind];
      if (!def) continue;
      const age = now - s.at.getTime();
      const sign = s.polarity === "neg" ? -1 : 1;
      score += sign * s.weight * decay(age, def.halfLifeDays);
    }
  } else {
    score = 0;
  }

  score = Math.round(clamp(score, 0, 100));
  const band = bandFor(score, locked);

  await db.candidate.update({
    where: { id: candidateId },
    data: { pulseScore: score, pulseBand: band, pulseUpdatedAt: new Date() },
  });

  return { score, band };
}

/**
 * Full breakdown for the popover and profile panel. Includes the last 14d
 * sparkline (per-day score reconstructed from signal contributions).
 */
export async function getPulseBreakdown(
  workspaceId: string,
  candidateId: string,
): Promise<PulseBreakdown | null> {
  const c = await db.candidate.findFirst({
    where: { id: candidateId, workspaceId },
    select: { pulseScore: true, pulseBand: true, pulseUpdatedAt: true },
  });
  if (!c) return null;

  // If no score has ever been computed, compute it now so callers always
  // see something sensible.
  if (c.pulseScore == null) {
    const { score, band } = await recomputePulse(workspaceId, candidateId);
    c.pulseScore = score;
    c.pulseBand = band;
    c.pulseUpdatedAt = new Date();
  }

  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const [signals, app] = await Promise.all([
    db.pulseSignal.findMany({
      where: { workspaceId, candidateId, at: { gte: sixtyDaysAgo } },
      orderBy: { at: "desc" },
      take: 50,
    }),
    db.application.findFirst({
      where: { workspaceId, candidateId, archived: false },
      include: { stage: true },
      orderBy: { appliedAt: "desc" },
    }),
  ]);

  const stageKey = app?.stage?.key || "applied";
  const baseline = STAGE_BASELINE[stageKey] ?? DEFAULT_BASELINE;

  // 14-day sparkline — reconstruct daily snapshots by replaying decay.
  const sparkline = buildSparkline(signals.map((s) => ({ at: s.at, kind: s.kind as PulseSignalKind, weight: s.weight, polarity: s.polarity as "pos" | "neg" })), baseline);

  return {
    candidateId,
    score: c.pulseScore!,
    band: (c.pulseBand as PulseBand) || "warm",
    baseline,
    updatedAt: c.pulseUpdatedAt,
    signals: signals.map((s) => ({
      id: s.id,
      kind: s.kind as PulseSignalKind,
      polarity: s.polarity as "pos" | "neg",
      weight: s.weight,
      source: s.source,
      evidence: (s.evidence as Record<string, unknown>) || {},
      at: s.at,
    })),
    sparkline,
  };
}

function buildSparkline(
  signals: { at: Date; kind: PulseSignalKind; weight: number; polarity: "pos" | "neg" }[],
  baseline: number,
): number[] {
  const out: number[] = [];
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  for (let d = 13; d >= 0; d--) {
    const t = now - d * DAY;
    let s = baseline;
    for (const sig of signals) {
      const age = t - sig.at.getTime();
      if (age < 0) continue;
      const def = SIGNAL_DEFS[sig.kind];
      if (!def) continue;
      const sign = sig.polarity === "neg" ? -1 : 1;
      s += sign * sig.weight * decay(age, def.halfLifeDays);
    }
    out.push(Math.round(clamp(s, 0, 100)));
  }
  return out;
}

// ── Human-readable labels for the breakdown popover ──────────────────
export function signalLabel(kind: PulseSignalKind): string {
  switch (kind) {
    case "message_received": return "Replied to outbound";
    case "message_fast_reply": return "Replied within their median window";
    case "message_long_reply": return "Long, considered reply";
    case "positive_sentiment": return "Positive tone in last message";
    case "question_asked": return "Asked a question — shows interest";
    case "link_clicked": return "Clicked a link in our email";
    case "email_opened": return "Opened an email";
    case "career_site_revisit": return "Revisited the job page";
    case "no_reply_overdue": return "Outbound overdue — no reply";
    case "no_open": return "Several outbounds unopened";
    case "stage_idle": return "Stage idle past median";
    case "negative_sentiment": return "Concerns raised in last message";
    case "reschedule_requested": return "Reschedule requested";
    case "interview_no_show": return "No-show at interview";
    case "unsubscribe": return "Unsubscribed from communications";
    case "stage_advanced": return "Advanced to next stage";
    case "offer_sent": return "Offer sent";
  }
}
