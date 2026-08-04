// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// lib/stage-history.ts — write-only helper for CandidateStageHistory.
//
// Every application stage transition flows through here. Powers:
//   - recap `stage_moves` (count by from→to in scope)
//   - recap `stalled_candidates` with 1.5× median time-in-stage
//   - future analytics on conversion rates per stage
//
// Idempotent: if the from/to keys are identical we don't record a no-op.

import { db } from "@/lib/db";
import { logger } from "@/lib/log";

const log = logger("stage-history");

export async function recordStageMove(args: {
  workspaceId: string;
  applicationId: string;
  candidateId: string;
  jobId: string;
  fromStageId: string | null;
  fromStageKey: string | null;
  toStageId: string | null;
  toStageKey: string | null;
  actorId: string | null;
  actorName: string | null;
}): Promise<void> {
  if (args.fromStageId === args.toStageId && args.fromStageKey === args.toStageKey) {
    return;
  }
  try {
    await db.candidateStageHistory.create({
      data: {
        workspaceId: args.workspaceId,
        applicationId: args.applicationId,
        candidateId: args.candidateId,
        jobId: args.jobId,
        fromStageId: args.fromStageId,
        toStageId: args.toStageId,
        fromStageKey: args.fromStageKey,
        toStageKey: args.toStageKey,
        actorId: args.actorId,
        actorName: args.actorName,
      },
    });
  } catch (e) {
    // Never block a stage-change request on history logging.
    log.warn("write failed:", (e as Error).message);
  }
}

/**
 * Compute the median time (in days) that recent applications spent in each
 * stage in a workspace. Used by the recap's `stalled_candidates` item to
 * apply the spec's "1.5× median" threshold instead of a static 5-day cut.
 *
 * Strategy: walk the stage-history table, pair every (from→to) transition
 * with its previous transition for the same application to compute
 * dwell time, then median per `toStageKey` (i.e. dwell time spent in the
 * stage the app left).
 *
 * Returns `Record<stageKey, medianDays>`. Stages with fewer than 3 data
 * points are omitted (insufficient signal).
 */
export async function workspaceStageMedians(
  workspaceId: string,
  windowDays = 90,
): Promise<Record<string, number>> {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const rows = await db.candidateStageHistory.findMany({
    where: { workspaceId, movedAt: { gte: since }, applicationId: { not: null } },
    select: { applicationId: true, fromStageKey: true, toStageKey: true, movedAt: true },
    orderBy: [{ applicationId: "asc" }, { movedAt: "asc" }],
  });

  // Group by application, walk pairs.
  const dwellsByStage = new Map<string, number[]>();
  let lastApp: string | null = null;
  let lastEnter: Date | null = null;
  let lastKey: string | null = null;
  for (const r of rows) {
    if (r.applicationId !== lastApp) {
      lastApp = r.applicationId;
      lastEnter = r.movedAt;
      lastKey = r.toStageKey;
      continue;
    }
    if (lastEnter && lastKey) {
      const dwellDays = (r.movedAt.getTime() - lastEnter.getTime()) / 86_400_000;
      const arr = dwellsByStage.get(lastKey) || [];
      arr.push(dwellDays);
      dwellsByStage.set(lastKey, arr);
    }
    lastEnter = r.movedAt;
    lastKey = r.toStageKey;
  }

  const out: Record<string, number> = {};
  for (const [key, dwells] of dwellsByStage) {
    if (dwells.length < 3) continue;
    const sorted = [...dwells].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    out[key] = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }
  return out;
}
