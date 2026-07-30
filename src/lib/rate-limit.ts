// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Tiny in-memory fixed-window rate limiter.
 *
 * Scoped to the single-process OSS deploy — the same posture as the email
 * poller (`email-worker.ts`), which also keeps its coordination state on
 * `globalThis`. A multi-replica deployment would swap this for Redis, but the
 * call sites (`rateLimit(key, opts)`) stay the same.
 *
 * Fixed window rather than token bucket: simpler, and the goal here is only to
 * blunt brute-force / spam / cost-drain, not to meter a paid API precisely.
 */

type Bucket = { count: number; resetAt: number };

declare global {
  // `var` is required here — ambient global augmentation doesn't allow let/const.
  var __vellumRateLimiter: Map<string, Bucket> | undefined;
}

function store(): Map<string, Bucket> {
  if (!globalThis.__vellumRateLimiter) globalThis.__vellumRateLimiter = new Map();
  return globalThis.__vellumRateLimiter;
}

export type RateLimitResult = {
  ok: boolean;
  /** Requests still allowed in the current window (0 when blocked). */
  remaining: number;
  /** Seconds until the window resets — send as `Retry-After` when blocking. */
  retryAfterSec: number;
};

/**
 * Count one hit against `key`. Returns `ok:false` once more than `limit` hits
 * land inside `windowMs`. The blocked request is still counted, so sustained
 * hammering keeps the window pinned shut until the caller backs off.
 */
export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const map = store();

  // Opportunistic pruning so a burst of unique keys can't grow the map without
  // bound. Cheap: only scans when the map is already large.
  if (map.size > 5000) {
    for (const [k, b] of map) if (b.resetAt <= now) map.delete(k);
  }

  let bucket = map.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + opts.windowMs };
    map.set(key, bucket);
  }
  bucket.count += 1;

  const ok = bucket.count <= opts.limit;
  return {
    ok,
    remaining: ok ? opts.limit - bucket.count : 0,
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/** Drop the counter for `key` — e.g. after a successful login. */
export function rateLimitReset(key: string): void {
  store().delete(key);
}

/**
 * Shared per-user throttle for the authenticated /api/ai/* routes. They all
 * spend the workspace's paid provider key, and `ai/complete` is effectively a
 * general LLM proxy, so an insider (or a stolen session) could otherwise drain
 * the token budget. 40/min per user is generous for UI-driven use.
 */
export function aiRateLimit(workspaceId: string, userId: string): RateLimitResult {
  return rateLimit(`ai:${workspaceId}:${userId}`, { limit: 40, windowMs: 60_000 });
}

/**
 * Best-effort client IP from proxy headers. Caddy (our deploy front) sets
 * `X-Forwarded-For`; we take the left-most entry (the original client). Falls
 * back to a constant so a missing header degrades to a shared bucket rather
 * than throwing — still rate-limited, just coarser.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
