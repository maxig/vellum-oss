// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Custom career-site domains — careers.acme.com → the "acme" workspace.
 *
 * Career sites normally live at `<slug>.<PUBLIC_DOMAIN>`, which middleware.ts
 * resolves by string surgery alone. A workspace's *own* domain shares no
 * suffix with the apex, so the host → workspace mapping can only come from the
 * database (`CareerSite.customDomain`).
 *
 * The Edge middleware can't reach Prisma, so it asks the app over HTTP
 * (`/api/public/domain-check`) and memoises the answer here. Caddy's on-demand
 * TLS asks that same endpoint before issuing a certificate — which together is
 * what lets a new company's domain start working with no Caddyfile edit and no
 * redeploy: they save it in Settings, point DNS, done.
 *
 * Pure string parsing plus `fetch` (no Node APIs, no Prisma) so this stays
 * importable from the Edge runtime — the same constraint app-host.ts documents.
 */

import { isAppHost } from "@/lib/app-host";

/** RFC 1123 hostname, two labels minimum, ASCII (punycode already applied). */
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Canonical form of a custom domain, or null when it isn't a usable hostname.
 * Deliberately tolerant of what people actually paste into the settings field:
 * a full URL, a trailing slash, uppercase, a stray port, a root dot.
 */
export function normalizeCustomDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = raw.trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // https://careers.acme.com/jobs
  v = v.split(/[/?#]/)[0]!; // …            → careers.acme.com
  v = v.split(":")[0]!; // drop any port
  v = v.replace(/\.+$/, ""); // drop the root dot
  return HOSTNAME.test(v) ? v : null;
}

/**
 * Hosts a workspace must never be able to claim: the admin app's own origin,
 * and anything at or under PUBLIC_DOMAIN. Those are already routed by hostname
 * in middleware.ts, and a custom domain shadowing them would take the admin
 * panel — or another workspace's career site — offline.
 */
export function isReservedDomain(domain: string): boolean {
  const apex = (process.env.PUBLIC_DOMAIN || "localhost:3000").split(":")[0]!.toLowerCase();
  if (domain === apex || domain.endsWith("." + apex)) return true;
  return isAppHost(domain);
}

// ── Host → slug lookup, cached ────────────────────────────────────────

type Entry = { slug: string | null; expiresAt: number };

/**
 * Both TTLs are short on purpose. This cache lives in the Edge middleware's
 * sandbox, so the Node-runtime route that saves a domain can't invalidate it —
 * expiry is the only way a change propagates. A minute of staleness costs one
 * internal lookup per domain per minute; anything longer means an admin edits
 * their domain in Settings and watches it "not work" for five minutes.
 */
const HIT_TTL_MS = 60_000;
const MISS_TTL_MS = 30_000;
/** Unknown Host headers are attacker-controlled — bound the map. */
const MAX_ENTRIES = 500;
const LOOKUP_TIMEOUT_MS = 2_000;

const cache = new Map<string, Entry>();

/**
 * Origin to reach this same app on from inside the container. Not the request
 * origin: that would loop back out through Caddy and re-enter the middleware.
 */
function internalOrigin(): string {
  return process.env.INTERNAL_ORIGIN || `http://127.0.0.1:${process.env.PORT || "3000"}`;
}

/** Workspace slug that has claimed `host`, or null. Safe to call per request. */
export async function resolveCustomDomain(host: string): Promise<string | null> {
  const domain = normalizeCustomDomain(host);
  if (!domain) return null;

  const now = Date.now();
  const cached = cache.get(domain);
  if (cached && cached.expiresAt > now) return cached.slug;

  let slug: string | null = null;
  try {
    const res = await fetch(
      `${internalOrigin()}/api/public/domain-check?domain=${encodeURIComponent(domain)}`,
      { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
    );
    if (res.status === 200) {
      const body = (await res.json()) as { slug?: unknown };
      if (typeof body.slug === "string" && body.slug) slug = body.slug;
    }
  } catch {
    // App still booting, or a DB blip. Treat as "not a custom domain" so the
    // request falls through to the admin app instead of 500ing; the short
    // negative TTL means we retry within MISS_TTL_MS.
  }

  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(domain, { slug, expiresAt: now + (slug ? HIT_TTL_MS : MISS_TTL_MS) });
  return slug;
}
