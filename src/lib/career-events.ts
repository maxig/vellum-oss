// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// lib/career-events.ts — public career-site event tracker.
//
// Records page views, apply-form starts, and apply submissions into
// CareerSiteEvent. Used by the recap items:
//   - new_visitors        (distinct session ids by day)
//   - top_job_views       (page_view per job, scope-windowed)
//   - low_apply_rate      (page_view ÷ apply_complete per job)
//   - apply_dropoff       (form_start without form_submit)
//
// Server-side only — the public career site is server-rendered, so we
// emit events directly from the page handlers rather than a client pixel.

import { db } from "@/lib/db";
import { headers, cookies } from "next/headers";
import { hasConsent, sweepDeniedCookies } from "@/lib/consent";

export type CareerEventKind = "page_view" | "form_start" | "form_submit" | "apply_complete";

const SESSION_COOKIE = "vellum_anon";
const SESSION_TTL_DAYS = 90;
// Per-session dedupe window for page views so a refresh-spam doesn't blow
// up the numbers. 5 min is forgiving for "tab kept open" without
// double-counting a back-button navigation.
const PAGE_VIEW_DEDUPE_MS = 5 * 60 * 1000;

/**
 * Record a career-site event. Cheap to call from any career-site page or
 * API; never blocks the request (errors are swallowed and logged).
 */
export async function recordCareerEvent(args: {
  workspaceId: string;
  kind: CareerEventKind;
  jobId?: string | null;
  path?: string | null;
  referrer?: string | null;
}): Promise<void> {
  try {
    // Consent gate — the vellum_anon session cookie is "marketing" per
    // COOKIE_SPEC.md, so we must not set it (and therefore must not
    // write the analytics event) for visitors who declined. This keeps
    // first-party tracking on the same footing as injected scripts:
    // nothing fires until the visitor has explicitly opted in.
    if (!(await hasConsent("marketing"))) {
      // Sweep any stale `vellum_anon` left over from a previous session
      // where the visitor had consent and has since revoked it (or where
      // the consent version was bumped). The policy promises this and
      // the only way to keep the promise for an httpOnly cookie is to
      // delete it server-side.
      await sweepDeniedCookies();
      return;
    }

    const sessionId = await getOrCreateAnonSession();
    const h = await headers();
    const country = h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || null;
    const device = detectDevice(h.get("user-agent"));

    // Dedupe page_view per (session, jobId, recent) — cheaper than a JS-side
    // throttle and more honest than counting tab refreshes as new traffic.
    if (args.kind === "page_view") {
      const recent = await db.careerSiteEvent.findFirst({
        where: {
          workspaceId: args.workspaceId,
          kind: "page_view",
          sessionId,
          jobId: args.jobId || null,
          createdAt: { gte: new Date(Date.now() - PAGE_VIEW_DEDUPE_MS) },
        },
        select: { id: true },
      });
      if (recent) return;
    }

    await db.careerSiteEvent.create({
      data: {
        workspaceId: args.workspaceId,
        kind: args.kind,
        jobId: args.jobId || null,
        sessionId,
        country,
        device,
        referrer: args.referrer || h.get("referer") || null,
        path: args.path || null,
      },
    });
  } catch (e) {
    // Career-site events are best-effort — a failure here must never
    // break the public site.
    console.warn("[career-events] record failed:", (e as Error).message);
  }
}

/**
 * Get or create the anonymous visitor session cookie. We use a cuid-style
 * random string rather than the user's IP so we don't process PII for
 * analytics purposes. The cookie is httpOnly and sameSite=Lax.
 */
async function getOrCreateAnonSession(): Promise<string> {
  const c = await cookies();
  const existing = c.get(SESSION_COOKIE);
  if (existing?.value) return existing.value;
  const id = `s_${randomHex(20)}`;
  try {
    c.set(SESSION_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
      path: "/",
    });
  } catch {
    // Setting cookies during render works in handlers but not in some
    // RSC contexts; the next request will create a new id (slightly less
    // accurate analytics, but never an error).
  }
  return id;
}

function randomHex(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

// Coarse, cheap device classifier — enough for the analytics donut without
// a UA-parsing dependency. Bots get their own bucket so we can exclude
// them from "unique visitor" counts without losing the row entirely.
export function detectDevice(ua: string | null): "desktop" | "mobile" | "tablet" | "bot" | null {
  if (!ua) return null;
  const s = ua.toLowerCase();
  if (/bot|crawler|spider|crawling|google-inspectiontool|preview|headless|lighthouse|monitor/i.test(s)) {
    return "bot";
  }
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini|webos/i.test(s)) return "mobile";
  return "desktop";
}
