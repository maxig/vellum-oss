// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * SSRF egress guard for user-supplied connection URLs (CalDAV serverUrl, IMAP/
 * SMTP hosts, custom AI base URLs). Any authenticated member can save these,
 * and the server then connects to them — without a guard that's an internal-
 * network probe / metadata-endpoint exfil path.
 *
 * `assertPublicHost()` resolves the hostname and rejects it if it (or any of
 * its resolved addresses) lands in a private, loopback, link-local, or reserved
 * range. This blocks both IP literals (`http://169.254.169.254`) and names that
 * resolve inward (`localhost`, `foo.internal`, a rebind to 127.0.0.1).
 *
 * Enforcement is production-gated: local dev routinely points IMAP/SMTP/CalDAV
 * at `localhost` (MailHog, a dev Radicale), so outside production we allow it.
 * Set `VELLUM_ALLOW_PRIVATE_EGRESS=1` to allow private targets in production
 * too (self-hosters whose mail server shares the private network).
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

function privateEgressAllowed(): boolean {
  if (process.env.VELLUM_ALLOW_PRIVATE_EGRESS === "1") return true;
  return process.env.NODE_ENV !== "production";
}

/** True for addresses that must never be reachable from a user-supplied URL. */
export function isBlockedAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isBlockedV4(ip);
  if (v === 6) return isBlockedV6(ip);
  return true; // not a parseable IP → refuse rather than guess
}

function isBlockedV4(ip: string): boolean {
  const p = ip.split(".").map((n) => Number(n));
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a >= 224) return true; // multicast + reserved (224+)
  return false;
}

function isBlockedV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local fc00::/7
  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded v4.
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedV4(mapped[1]!);
  return false;
}

/**
 * Validate a URL string for outbound connection. Returns the parsed URL on
 * success; throws `SsrfError` when the scheme is disallowed or the target
 * resolves to a blocked address.
 *
 * @param allowedProtocols schemes to accept (default http/https).
 */
export async function assertPublicUrl(
  raw: string,
  allowedProtocols: string[] = ["http:", "https:"],
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError("Invalid URL");
  }
  if (!allowedProtocols.includes(url.protocol)) {
    throw new SsrfError(`Unsupported URL scheme: ${url.protocol}`);
  }
  await assertPublicHost(url.hostname);
  return url;
}

/**
 * Validate a bare hostname (IMAP/SMTP host fields aren't URLs). Resolves the
 * name and refuses if it — or any A/AAAA record — is a blocked address.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  if (privateEgressAllowed()) return;

  const host = hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (!host) throw new SsrfError("Empty host");

  // IP literal → check directly, no DNS.
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new SsrfError("Refusing to connect to a private or reserved address");
    return;
  }

  // `localhost` and friends may not resolve via DNS in every environment;
  // reject by name up front.
  const lower = host.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".internal") || lower.endsWith(".local")) {
    throw new SsrfError("Refusing to connect to an internal host");
  }

  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new SsrfError(`Could not resolve host: ${host}`);
  }
  if (records.length === 0) throw new SsrfError(`Host did not resolve: ${host}`);
  for (const r of records) {
    if (isBlockedAddress(r.address)) {
      throw new SsrfError("Refusing to connect to a private or reserved address");
    }
  }
}
