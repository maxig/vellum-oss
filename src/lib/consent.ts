// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// Server-side consent reader. Wraps next/headers cookies() so any RSC,
// route handler, or server action can ask "is this category allowed?"
// without re-implementing cookie parsing. The browser-side equivalents
// live in src/components/CookieConsent.tsx and CookieScripts.tsx.
import { cookies, headers } from "next/headers";
import {
  CONSENT_COOKIE,
  FIRST_PARTY_COOKIES,
  type CookieCategory,
  type ConsentRecord,
  categoryAllowed,
  emptyConsent,
  readConsentFromCookieString,
} from "@/lib/cookies";

/**
 * Returns the visitor's stored consent record, or — if none exists —
 * falls back to DNT/Sec-GPC signals. This honours the promise made in
 * the Cookie Policy ("Many browsers offer a Do Not Track signal, which
 * we treat as a request to keep functional and marketing categories
 * off"). An explicit consent cookie ALWAYS wins over the header, so a
 * visitor who actively opts in is not later denied by a stale DNT flag.
 */
export async function readServerConsent(): Promise<ConsentRecord | null> {
  const c = await cookies();
  const stored = readConsentFromCookieString(c.get(CONSENT_COOKIE)?.value);
  if (stored) return stored;
  const h = await headers();
  // Honour either the legacy DNT header (RFC 7240) or the newer GPC
  // (Global Privacy Control) signal. Both signify "do not consent to
  // tracking" — translated here into a record where only Necessary is on.
  if (h.get("DNT") === "1" || h.get("Sec-GPC") === "1") {
    return emptyConsent();
  }
  return null;
}

export async function hasConsent(category: CookieCategory) {
  if (category === "necessary") return true;
  return categoryAllowed(await readServerConsent(), category);
}

/**
 * Delete any first-party cookies whose category is currently denied by
 * the visitor's consent. Called from public-page renders so that a
 * visitor whose `vellum_anon` predates their later "reject" decision
 * does not keep a stale marketing cookie sitting in their browser.
 *
 * Necessary cookies are never swept (the visitor can't opt out of them
 * anyway, and removing the session cookie would log them out).
 */
export async function sweepDeniedCookies(): Promise<void> {
  const consent = await readServerConsent();
  // No decision recorded yet and no DNT — keep cookies as they are; the
  // banner will appear and the visitor will decide.
  if (!consent) return;
  const c = await cookies();
  for (const ck of FIRST_PARTY_COOKIES) {
    if (ck.category === "necessary") continue;
    if (categoryAllowed(consent, ck.category)) continue;
    if (c.get(ck.name)?.value) {
      try {
        c.delete(ck.name);
      } catch {
        // Same caveat as setting cookies during render — some RSC
        // contexts disallow it. The cookie will be re-evaluated on the
        // next request that runs from a handler.
      }
    }
  }
}
