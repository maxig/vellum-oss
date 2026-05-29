// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Background review-queue worker.
 *
 * Single responsibility: every CACHE_INTERVAL_MS (default 60 min) walk
 * every workspace, fetch its eligible users, and rebuild each user's
 * ReviewQueueCache row. The sheet reads from this cache, so this is what
 * makes the queue feel instant.
 *
 * Patterned 1:1 on recap-worker.ts — same global-singleton guard so HMR
 * during dev doesn't stack intervals, same explicit logging so the
 * operator can confirm the worker came up, same per-workspace try/catch
 * so one bad workspace doesn't stall the whole tick.
 *
 * Per-workspace concurrency cap mentioned in the spec's open questions:
 * Phase 1 ships sequential (one workspace at a time) because the build is
 * cheap enough at < 500 apps. The internal loop iterates users serially
 * within a workspace. Promoting to bounded-parallel fan-out is a Phase 3
 * concern.
 */

import { db } from "@/lib/db";
import { buildReviewQueue, eligibleUsersForBuild } from "@/lib/review-queue";

const CACHE_INTERVAL_MS = Number(process.env.REVIEW_QUEUE_INTERVAL_MS || 60 * 60 * 1000);

declare global {
  // eslint-disable-next-line no-var
  var __vellumReviewQueueWorker:
    | {
        started: boolean;
        running: boolean;
        timer: NodeJS.Timeout | null;
        ticks: number;
      }
    | undefined;
}

function state() {
  if (!globalThis.__vellumReviewQueueWorker) {
    globalThis.__vellumReviewQueueWorker = {
      started: false,
      running: false,
      timer: null,
      ticks: 0,
    };
  }
  return globalThis.__vellumReviewQueueWorker;
}

async function tick() {
  const s = state();
  if (s.running) {
    console.log("[review-queue-worker] tick skipped — previous run still in flight");
    return;
  }
  s.running = true;
  s.ticks += 1;
  const tickId = s.ticks;
  const startedAt = Date.now();
  let totalUsers = 0;
  let totalItems = 0;
  let failures = 0;
  try {
    const workspaces = await db.workspace.findMany({ select: { id: true, name: true } });
    console.log(
      `[review-queue-worker] tick #${tickId} starting · ${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}`,
    );
    for (const ws of workspaces) {
      let wsUsers = 0;
      let wsItems = 0;
      try {
        const userIds = await eligibleUsersForBuild(ws.id);
        for (const userId of userIds) {
          try {
            const result = await buildReviewQueue({ workspaceId: ws.id, userId });
            wsUsers += 1;
            wsItems += result.items.length;
          } catch (e) {
            failures += 1;
            console.warn(
              `[review-queue-worker] tick #${tickId} ${ws.id}/${userId} FAILED:`,
              (e as Error).message,
            );
          }
        }
        totalUsers += wsUsers;
        totalItems += wsItems;
        console.log(
          `[review-queue-worker] tick #${tickId} ${ws.id} OK · users=${wsUsers} items=${wsItems}`,
        );
      } catch (e) {
        failures += 1;
        console.warn(
          `[review-queue-worker] tick #${tickId} ${ws.id} FAILED:`,
          (e as Error).message,
        );
      }
    }
  } finally {
    s.running = false;
    console.log(
      `[review-queue-worker] tick #${tickId} finished in ${Date.now() - startedAt}ms · users=${totalUsers} items=${totalItems} failures=${failures}`,
    );
  }
}

export function startReviewQueueWorker() {
  if (process.env.REVIEW_QUEUE_WORKER_DISABLED === "1") {
    console.log("[review-queue-worker] disabled by REVIEW_QUEUE_WORKER_DISABLED=1");
    return;
  }
  const s = state();
  if (s.started) {
    console.log("[review-queue-worker] startup called more than once — keeping existing interval");
    return;
  }
  s.started = true;
  console.log(
    `[review-queue-worker] startup · interval=${Math.round(CACHE_INTERVAL_MS / 1000)}s`,
  );

  // Initial tick shortly after boot so a fresh server has data without
  // waiting a full hour. Offset from recap-worker's 12s so they don't
  // pile on the DB at the same instant.
  setTimeout(
    () => tick().catch((e) => console.warn("[review-queue-worker] initial tick failed:", e)),
    18_000,
  );

  s.timer = setInterval(() => {
    tick().catch((e) => console.warn("[review-queue-worker] tick failed:", e));
  }, CACHE_INTERVAL_MS);

  if (s.timer && typeof s.timer.unref === "function") s.timer.unref();
}
