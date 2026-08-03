// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Background email poller.
 *
 * Lazy-starts a single setInterval on first import. Polls every enabled
 * workspace inbox at most once per `intervalMs` (default 3 minutes). Designed
 * for the single-process OSS deploy — production multi-replica setups would
 * lift this into a separate worker, but that's out of scope for the MVP.
 *
 * The interval is stashed on `globalThis` so Next.js HMR doesn't double-start it.
 *
 * Every tick logs prominently so the operator can grep `[email-worker]` /
 * `[email-poll]` in the server log to follow what's happening across runs.
 */
import { db } from "@/lib/db";
import { pollWorkspaceInbox } from "@/lib/email";
import { envInterval } from "@/lib/utils";

const INTERVAL_MS = envInterval(process.env.EMAIL_POLL_INTERVAL_MS, 3 * 60 * 1000);

declare global {
   
  var __vellumEmailWorker: { started: boolean; running: boolean; timer: NodeJS.Timeout | null; tickCount: number } | undefined;
}

function state() {
  if (!globalThis.__vellumEmailWorker) {
    globalThis.__vellumEmailWorker = { started: false, running: false, timer: null, tickCount: 0 };
  }
  return globalThis.__vellumEmailWorker;
}

async function tick() {
  const s = state();
  if (s.running) {
    console.log("[email-worker] tick skipped — previous run still in flight");
    return;
  }
  s.running = true;
  s.tickCount += 1;
  const tickId = s.tickCount;
  const startedAt = Date.now();
  try {
    const accounts = await db.emailAccount.findMany({
      where: { enabled: true },
      select: { workspaceId: true },
    });
    console.log(
      `[email-worker] tick #${tickId} starting at ${new Date(startedAt).toISOString()} · ${accounts.length} enabled account${accounts.length === 1 ? "" : "s"}`,
    );
    if (accounts.length === 0) {
      console.log("[email-worker] tick #" + tickId + " no enabled email accounts");
    }
    for (const acct of accounts) {
      try {
        const result = await pollWorkspaceInbox(acct.workspaceId);
        // Re-stamp lastPolledAt at the worker level too. `pollWorkspaceInbox`
        // already does this on success, but doing it here is the second
        // safety net — if a future caller swallows the success path early,
        // the worker still records that we got a clean result.
        await db.emailAccount
          .update({
            where: { workspaceId: acct.workspaceId },
            data: { lastPolledAt: new Date(), lastError: null },
          })
          .catch(() => {});
        console.log(
          `[email-worker] tick #${tickId} ${acct.workspaceId} OK · ingested=${result.ingested} checked=${result.checked} since=${result.since}`,
        );
      } catch (e) {
        const msg = (e as Error).message;
        console.warn(`[email-worker] tick #${tickId} ${acct.workspaceId} FAILED:`, msg);
        // Surface the failure in Settings → Email so the recruiter notices.
        // We do NOT bump lastPolledAt on failure — the next tick will retry
        // the same window so nothing gets missed.
        await db.emailAccount
          .update({ where: { workspaceId: acct.workspaceId }, data: { lastError: msg.slice(0, 2000) } })
          .catch(() => {});
      }
    }
  } finally {
    s.running = false;
    const elapsed = Date.now() - startedAt;
    console.log(`[email-worker] tick #${tickId} finished in ${elapsed}ms`);
  }
}

export function startEmailWorker() {
  if (process.env.EMAIL_POLL_DISABLED === "1") {
    console.log("[email-worker] disabled by EMAIL_POLL_DISABLED=1");
    return;
  }
  const s = state();
  if (s.started) {
    console.log("[email-worker] startup called more than once — keeping existing interval");
    return;
  }
  s.started = true;
  console.log(`[email-worker] startup · interval=${Math.round(INTERVAL_MS / 1000)}s`);
  // Fire once shortly after startup so the user sees mail land without waiting
  // the full interval, then settle into the cadence.
  setTimeout(() => {
    tick().catch((e) => console.warn("[email-worker] initial tick failed:", e));
  }, 8_000);
  s.timer = setInterval(() => {
    tick().catch((e) => console.warn("[email-worker] tick failed:", e));
  }, INTERVAL_MS);
  // Prevent the interval from holding the event loop open during graceful shutdown.
  if (s.timer && typeof (s.timer as NodeJS.Timeout).unref === "function") {
    (s.timer as NodeJS.Timeout).unref();
  }
}
