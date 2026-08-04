// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Levelled logging.
 *
 * Vellum used to log everything through bare `console.log`, which meant a
 * production box carried the same firehose a developer wants while debugging —
 * per-tick worker chatter, per-message IMAP detail, even raw email bodies. That
 * is both noise and a privacy problem, and on one deploy it filled a disk.
 *
 * Levels, loudest-first:
 *
 *   error  Something failed and needs a human. Always on.
 *   warn   Degraded but handled — one account failed, we retried, we moved on.
 *   info   Essential lifecycle only: process/worker startup, config summary.
 *          This is the production default; keep it sparse enough that a healthy
 *          instance is nearly silent.
 *   debug  Per-tick / per-request detail. The default when developing.
 *   trace  Firehose: per-message, per-UID, payload dumps. Never on in prod.
 *
 * Set `LOG_LEVEL` to any of the above (or `silent`). Unset defaults to `info`
 * in production and `debug` everywhere else. Client components read
 * `NEXT_PUBLIC_LOG_LEVEL`, since only NEXT_PUBLIC_* is inlined into the bundle.
 *
 * Namespaces preserve the existing `[email-worker]` prefix convention, so
 * `docker compose logs app | grep '[email-worker]'` keeps working.
 */

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";

const RANK: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

function resolveLevel(): LogLevel {
  // `process.env.LOG_LEVEL` is undefined in client bundles (Next only inlines
  // NEXT_PUBLIC_*), so fall through to the public var, then to the default.
  const raw = (process.env.LOG_LEVEL || process.env.NEXT_PUBLIC_LOG_LEVEL || "")
    .trim()
    .toLowerCase();
  if (raw && raw in RANK) return raw as LogLevel;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

// Resolved once at module load — level is a deploy-time decision, and a
// per-call lookup would be pure overhead on the hot paths this exists to tame.
const ACTIVE: LogLevel = resolveLevel();
const THRESHOLD = RANK[ACTIVE];

export function activeLogLevel(): LogLevel {
  return ACTIVE;
}

/** True when `level` would actually be emitted. Guard expensive payloads with
 *  this — `JSON.stringify` of a large object costs the same whether or not the
 *  line is ultimately dropped. */
export function isEnabled(level: Exclude<LogLevel, "silent">): boolean {
  return RANK[level] <= THRESHOLD;
}

export interface Logger {
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  trace(...args: unknown[]): void;
  /** True when `level` would be emitted — same as the module-level `isEnabled`. */
  enabled(level: Exclude<LogLevel, "silent">): boolean;
  /** Nest a namespace: logger("email").child("imap") logs as `[email:imap]`. */
  child(namespace: string): Logger;
}

function emit(
  level: Exclude<LogLevel, "silent">,
  prefix: string,
  args: unknown[],
): void {
  if (RANK[level] > THRESHOLD) return;
  // error/warn to stderr, everything else to stdout — so `docker compose logs`
  // and any log shipper can split real problems from routine output.
  const sink =
    level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (prefix) sink(prefix, ...args);
  else sink(...args);
}

/**
 * Create a namespaced logger. `logger("email-worker").info("up")` prints
 * `[email-worker] up`. Omit the namespace for an unprefixed logger.
 */
export function logger(namespace?: string): Logger {
  const prefix = namespace ? `[${namespace}]` : "";
  return {
    error: (...args) => emit("error", prefix, args),
    warn: (...args) => emit("warn", prefix, args),
    info: (...args) => emit("info", prefix, args),
    debug: (...args) => emit("debug", prefix, args),
    trace: (...args) => emit("trace", prefix, args),
    enabled: (level) => RANK[level] <= THRESHOLD,
    child: (nested) => logger(namespace ? `${namespace}:${nested}` : nested),
  };
}

/** Unprefixed default logger, for the handful of call sites with no namespace. */
export const log = logger();
