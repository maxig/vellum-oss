// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Background recap worker.
 *
 * Two responsibilities, two cadences:
 *
 * 1. **Cache refresh** — every CACHE_INTERVAL_MS (default 15 min), regenerate
 *    "today" recaps for every workspace. The dashboard reads from the cache,
 *    so this is what makes the dashboard feel instant.
 *
 * 2. **Digest dispatch** — every DISPATCH_INTERVAL_MS (default 5 min), check
 *    whether any workspace's next scheduled digest (daily / weekly / monthly)
 *    is due in the workspace's local timezone, and send it. We dedupe via
 *    the RecapDelivery table so we never double-send.
 *
 * The worker is a single setInterval started once per Node process (HMR-safe
 * via globalThis). Designed for the OSS single-process deploy; production
 * multi-replica would lift this into a separate worker, the same way the
 * email worker is structured.
 */

import { db } from "@/lib/db";
import { buildRecap, personalizeRecap, type RecapScope } from "@/lib/recap";
import { renderRecapEmail } from "@/lib/recap-email";
import { sendOutboundEmail } from "@/lib/email";

const CACHE_INTERVAL_MS = Number(process.env.RECAP_CACHE_INTERVAL_MS || 60 * 60 * 1000);
const DISPATCH_INTERVAL_MS = Number(process.env.RECAP_DISPATCH_INTERVAL_MS || 5 * 60 * 1000);
const DAILY_HOUR = Number(process.env.RECAP_DAILY_HOUR || 8);  // 08:00 workspace-local
const WEEKLY_DAY = Number(process.env.RECAP_WEEKLY_DAY || 1);  // Monday (1) in workspace-local
const MONTHLY_DAY = Number(process.env.RECAP_MONTHLY_DAY || 1); // 1st of month in workspace-local

declare global {
  // eslint-disable-next-line no-var
  var __vellumRecapWorker:
    | {
        started: boolean;
        cacheRunning: boolean;
        dispatchRunning: boolean;
        cacheTimer: NodeJS.Timeout | null;
        dispatchTimer: NodeJS.Timeout | null;
        cacheTicks: number;
        dispatchTicks: number;
      }
    | undefined;
}

function state() {
  if (!globalThis.__vellumRecapWorker) {
    globalThis.__vellumRecapWorker = {
      started: false,
      cacheRunning: false,
      dispatchRunning: false,
      cacheTimer: null,
      dispatchTimer: null,
      cacheTicks: 0,
      dispatchTicks: 0,
    };
  }
  return globalThis.__vellumRecapWorker;
}

// ── Cache refresh ────────────────────────────────────────────────────
async function cacheTick() {
  const s = state();
  if (s.cacheRunning) {
    console.log("[recap-worker] cache tick skipped — previous run still in flight");
    return;
  }
  s.cacheRunning = true;
  s.cacheTicks += 1;
  const tickId = s.cacheTicks;
  const startedAt = Date.now();
  try {
    const workspaces = await db.workspace.findMany({ select: { id: true, name: true } });
    console.log(
      `[recap-worker] cache tick #${tickId} starting · ${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}`,
    );
    for (const ws of workspaces) {
      try {
        // `force: true` always rebuilds, even when there's a fresh cache row,
        // so the next dashboard load sees the most recent data.
        const result = await buildRecap(ws.id, "today", { force: true });
        console.log(
          `[recap-worker] cache tick #${tickId} ${ws.id} OK · items=${result.items.length} hasAI=${result.hasAI}`,
        );
      } catch (e) {
        console.warn(`[recap-worker] cache tick #${tickId} ${ws.id} FAILED:`, (e as Error).message);
      }
    }
  } finally {
    s.cacheRunning = false;
    console.log(`[recap-worker] cache tick #${tickId} finished in ${Date.now() - startedAt}ms`);
  }
}

type WorkspaceRecapPolicy = {
  enabledScopes: Set<RecapScope>;
  dailyHour: number;
  weeklyDay: number;
  monthlyDay: number;
};

/**
 * Resolve a workspace's recap policy. Reads from AIConfig.recapSettings
 * (timing) and AIConfig.features (which cadences are enabled), falling
 * back to env defaults for unset fields. Centralised here so the dispatch
 * tick has one source of truth.
 */
async function policyFor(workspaceId: string): Promise<WorkspaceRecapPolicy> {
  const cfg = await db.aIConfig.findUnique({
    where: { workspaceId },
    select: { features: true, recapSettings: true },
  });
  const features = (cfg?.features as Record<string, boolean> | null) || {};
  const settings = (cfg?.recapSettings as Record<string, unknown> | null) || {};
  const timing = (settings.timing as Record<string, number> | undefined) || {};
  const enabledScopes = new Set<RecapScope>();
  // Defaults: today + weekly on, monthly off — matches AITab initial state.
  if (features.recapDaily !== false) enabledScopes.add("today");
  if (features.recapWeekly !== false) enabledScopes.add("week");
  if (features.recapMonthly === true) enabledScopes.add("month");
  return {
    enabledScopes,
    dailyHour: typeof timing.dailyHour === "number" ? timing.dailyHour : DAILY_HOUR,
    weeklyDay: typeof timing.weeklyDay === "number" ? timing.weeklyDay : WEEKLY_DAY,
    monthlyDay: typeof timing.monthlyDay === "number" ? timing.monthlyDay : MONTHLY_DAY,
  };
}

// ── Digest dispatch ──────────────────────────────────────────────────
async function dispatchTick() {
  const s = state();
  if (s.dispatchRunning) {
    console.log("[recap-worker] dispatch tick skipped — previous run still in flight");
    return;
  }
  s.dispatchRunning = true;
  s.dispatchTicks += 1;
  const tickId = s.dispatchTicks;
  const startedAt = Date.now();
  try {
    const workspaces = await db.workspace.findMany({
      select: { id: true, name: true, timezone: true },
    });
    console.log(
      `[recap-worker] dispatch tick #${tickId} starting · ${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}`,
    );
    for (const ws of workspaces) {
      try {
        const policy = await policyFor(ws.id);
        const due = scopesDueNow(ws.timezone || "UTC", policy);
        for (const scope of due) {
          await dispatchScope(ws.id, ws.name, ws.timezone || "UTC", scope, tickId);
        }
      } catch (e) {
        console.warn(`[recap-worker] dispatch tick #${tickId} ${ws.id} FAILED:`, (e as Error).message);
      }
    }
  } finally {
    s.dispatchRunning = false;
    console.log(`[recap-worker] dispatch tick #${tickId} finished in ${Date.now() - startedAt}ms`);
  }
}

/**
 * Compute which scopes (if any) are *due now* for the given workspace.
 * Reads the workspace's stored timing + cadence toggles, then checks the
 * local clock with a small window after the trigger time to allow for
 * dispatch-tick jitter.
 */
function scopesDueNow(timezone: string, policy: WorkspaceRecapPolicy): RecapScope[] {
  const now = new Date();
  const localParts = localTimeParts(now, timezone);
  const due: RecapScope[] = [];

  const minutesIntoHour = localParts.hour * 60 + localParts.minute;
  const dailyTriggerMinutes = policy.dailyHour * 60;
  // Hit window: the configured hour, for one DISPATCH_INTERVAL_MS slice.
  const windowMinutes = Math.max(1, Math.round(DISPATCH_INTERVAL_MS / 60_000));
  const hitDaily =
    minutesIntoHour >= dailyTriggerMinutes &&
    minutesIntoHour < dailyTriggerMinutes + windowMinutes;

  if (hitDaily) {
    if (policy.enabledScopes.has("today")) due.push("today");
    if (policy.enabledScopes.has("week") && localParts.weekday === policy.weeklyDay) due.push("week");
    if (policy.enabledScopes.has("month") && localParts.day === policy.monthlyDay) due.push("month");
  }
  return due;
}

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

/**
 * Get the workspace-local time. Uses Intl.DateTimeFormat with the IANA
 * timezone — that's the only way to get DST-correct local components in
 * Node without pulling in a TZ library. The `weekday` we return follows
 * the ISO convention (1 = Monday, 7 = Sunday) for consistency with the
 * WEEKLY_DAY env knob.
 */
function localTimeParts(d: Date, timezone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value])) as Record<string, string>;
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: weekdayMap[parts.weekday] ?? 1,
  };
}

/**
 * Send the digest for one (workspace, scope) tuple to all eligible
 * recipients. Idempotent via the RecapDelivery uniqueness constraint —
 * if the row already exists for this bucket, we skip that recipient.
 */
async function dispatchScope(
  workspaceId: string,
  workspaceName: string,
  timezone: string,
  scope: RecapScope,
  tickId: number,
) {
  // Always rebuild so the email reflects the freshest data, not a stale
  // 15-minute-old cache. This is the moment we want to spend the LLM call.
  const recap = await buildRecap(workspaceId, scope, { force: true });

  const recipients = await recipientsFor(workspaceId);
  if (recipients.length === 0) {
    console.log(`[recap-worker] dispatch #${tickId} ${workspaceId}/${scope} no recipients`);
    return;
  }

  const acct = await db.emailAccount.findUnique({ where: { workspaceId } });
  if (!acct || !acct.enabled) {
    console.log(`[recap-worker] dispatch #${tickId} ${workspaceId}/${scope} no email account — skipping`);
    return;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const { userId, email } of recipients) {
    // Dedupe: if we already sent this bucket to this recipient, skip.
    const existing = await db.recapDelivery.findUnique({
      where: {
        workspaceId_scope_bucket_recipient: {
          workspaceId,
          scope,
          bucket: recap.bucket,
          recipient: email,
        },
      },
    });
    if (existing && existing.status === "sent") {
      skipped += 1;
      continue;
    }

    // Per-recipient re-rank — boosts items about jobs/candidates the
    // recipient owns. Cheap (pure reorder, no LLM).
    const personalised = await personalizeRecap(workspaceId, recap, userId).catch(() => recap);

    const rendered = renderRecapEmail({
      workspaceName,
      recap: personalised,
      baseUrl,
      recipientEmail: email,
    });

    try {
      await sendOutboundEmail(workspaceId, {
        to: email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
      await db.recapDelivery.upsert({
        where: {
          workspaceId_scope_bucket_recipient: {
            workspaceId,
            scope,
            bucket: recap.bucket,
            recipient: email,
          },
        },
        create: { workspaceId, scope, bucket: recap.bucket, recipient: email, status: "sent" },
        update: { status: "sent", error: null, sentAt: new Date() },
      });
      sent += 1;
    } catch (e) {
      failed += 1;
      const msg = (e as Error).message;
      console.warn(`[recap-worker] dispatch #${tickId} ${workspaceId}/${scope} → ${email} FAILED:`, msg);
      await db.recapDelivery
        .upsert({
          where: {
            workspaceId_scope_bucket_recipient: {
              workspaceId,
              scope,
              bucket: recap.bucket,
              recipient: email,
            },
          },
          create: { workspaceId, scope, bucket: recap.bucket, recipient: email, status: "failed", error: msg.slice(0, 2000) },
          update: { status: "failed", error: msg.slice(0, 2000), sentAt: new Date() },
        })
        .catch(() => {});
    }
  }

  console.log(
    `[recap-worker] dispatch #${tickId} ${workspaceId}/${scope} tz=${timezone} bucket=${recap.bucket} · sent=${sent} skipped=${skipped} failed=${failed}`,
  );
}

type Recipient = { userId: string; email: string };

/**
 * Pick the recipients for this workspace's digest. Default is all
 * owners + admins; when AIConfig.recapSettings.recipients is set, only
 * those users are eligible. In both modes, per-user mute via
 * UserPreference.notifications.emailWeeklyDigest is respected.
 *
 * Returns userId+email pairs so dispatch can both (a) personalize the
 * recap with audience_relevance and (b) send to the right address.
 */
async function recipientsFor(workspaceId: string): Promise<Recipient[]> {
  const cfg = await db.aIConfig.findUnique({
    where: { workspaceId },
    select: { recapSettings: true },
  });
  const settings = (cfg?.recapSettings as Record<string, unknown> | null) || {};
  const explicit = Array.isArray(settings.recipients) ? (settings.recipients as string[]) : null;

  const memberships = await db.membership.findMany({
    where: explicit
      ? { workspaceId, userId: { in: explicit } }
      : { workspaceId, role: { in: ["owner", "admin"] } },
    include: { user: { include: { preferences: true } } },
  });
  return memberships
    .filter((m) => {
      const prefs = m.user.preferences?.notifications as Record<string, unknown> | null | undefined;
      if (prefs && prefs.emailWeeklyDigest === false) return false;
      return Boolean(m.user.email);
    })
    .map((m) => ({ userId: m.user.id, email: m.user.email }));
}

// ── Public start function ────────────────────────────────────────────
export function startRecapWorker() {
  if (process.env.RECAP_WORKER_DISABLED === "1") {
    console.log("[recap-worker] disabled by RECAP_WORKER_DISABLED=1");
    return;
  }
  const s = state();
  if (s.started) {
    console.log("[recap-worker] startup called more than once — keeping existing intervals");
    return;
  }
  s.started = true;
  console.log(
    `[recap-worker] startup · cache=${Math.round(CACHE_INTERVAL_MS / 1000)}s dispatch=${Math.round(
      DISPATCH_INTERVAL_MS / 1000,
    )}s daily@${DAILY_HOUR}:00 (workspace-local)`,
  );

  // Fire both ticks shortly after boot so a fresh start sees real data
  // without waiting a full interval.
  setTimeout(() => cacheTick().catch((e) => console.warn("[recap-worker] initial cache failed:", e)), 12_000);
  setTimeout(() => dispatchTick().catch((e) => console.warn("[recap-worker] initial dispatch failed:", e)), 25_000);

  s.cacheTimer = setInterval(() => {
    cacheTick().catch((e) => console.warn("[recap-worker] cache tick failed:", e));
  }, CACHE_INTERVAL_MS);
  s.dispatchTimer = setInterval(() => {
    dispatchTick().catch((e) => console.warn("[recap-worker] dispatch tick failed:", e));
  }, DISPATCH_INTERVAL_MS);

  // Don't block graceful shutdown.
  if (s.cacheTimer && typeof s.cacheTimer.unref === "function") s.cacheTimer.unref();
  if (s.dispatchTimer && typeof s.dispatchTimer.unref === "function") s.dispatchTimer.unref();
}
