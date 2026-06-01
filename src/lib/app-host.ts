// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// Helpers for recognising the admin app's own origin.
//
// Career-site routing treats any subdomain of PUBLIC_DOMAIN as a workspace
// (acme.example.com → /careers/acme). But the admin app is often served from a
// subdomain of that same apex too — e.g. PUBLIC_DOMAIN=example.com with the app
// at vellum.example.com. Without an exception, "vellum" looks like a workspace
// slug and the admin panel never renders. These helpers let both the Edge
// middleware and the server resolve that one host back to the app.
//
// Pure string/env parsing only (no Node APIs) so it is safe in the Edge runtime.

function stripPort(host: string): string {
  return host.split(":")[0].trim().toLowerCase();
}

function hostFromUrl(raw: string | undefined | null): string | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withScheme).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Bare hostname (no port) the admin app is served from, or null when it can't
 * be determined (e.g. a single localhost dev origin, where no exception is
 * needed anyway). Prefers APP_DOMAIN (already a bare host, set in proxy/HTTPS
 * mode), then falls back to parsing APP_ORIGIN, then NEXTAUTH_URL.
 */
export function appHostBare(): string | null {
  const explicit = process.env.APP_DOMAIN;
  if (explicit && explicit.trim()) return stripPort(explicit);
  return hostFromUrl(process.env.APP_ORIGIN) ?? hostFromUrl(process.env.NEXTAUTH_URL);
}

/**
 * Full origin (protocol + host + optional port) of the admin app.
 * Prefers APP_ORIGIN, then NEXTAUTH_URL, then constructs it from headers if
 * provided, falling back to localhost.
 */
export function getAppOrigin(fallbackFromRequest?: string): string {
  const env = process.env.APP_ORIGIN || process.env.NEXTAUTH_URL;
  if (env) return env.replace(/\/$/, "");
  if (fallbackFromRequest) {
    try {
      return new URL(fallbackFromRequest).origin;
    } catch {
      /* ignore */
    }
  }
  return "http://localhost:3000";
}

/** True when `host` (with or without a port) is the admin app's own origin. */
export function isAppHost(host: string | undefined | null): boolean {
  if (!host) return false;
  const app = appHostBare();
  return app != null && stripPort(host) === app;
}

/**
 * URL scheme ("http" or "https") for candidate-facing / career-site links.
 * Derived from APP_ORIGIN (which setup.sh sets to https://… in the proxy/HTTPS
 * install mode), falling back to NEXTAUTH_URL, then "http" for plain-HTTP and
 * local installs. Career-site subdomains share the app's scheme in both modes,
 * so this is what lets an https:// admin page embed an https:// career-site
 * preview instead of an http:// one — which browsers (Safari especially) block
 * as mixed content.
 */
export function publicScheme(): "http" | "https" {
  const raw = (process.env.APP_ORIGIN || process.env.NEXTAUTH_URL || "").trim();
  return /^https:\/\//i.test(raw) ? "https" : "http";
}
