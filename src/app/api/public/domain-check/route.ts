// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { normalizeCustomDomain } from "@/lib/custom-domain";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/log";

const log = logger("domain-check");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** verifiedAt is re-stamped at most this often — this runs on every cert check. */
const VERIFY_STAMP_MS = 24 * 60 * 60 * 1000;

/**
 * Is `?domain=` claimed by a workspace as its career-site host?
 *
 * Two callers, both on a hot path:
 *
 *   • Caddy's on-demand TLS `ask` (the `on_demand_tls` global option that
 *     setup.sh writes). A 200 here is what authorises issuing a certificate,
 *     so this MUST stay a closed list — answering 200 for unknown hosts would
 *     let anyone point DNS at the box and burn the Let's Encrypt rate limit.
 *     Caddy requires exactly 200 for "allow"; any other status denies.
 *
 *   • middleware.ts, to map the request host onto /careers/<slug>.
 *
 * Deliberately unauthenticated: Caddy asks before any TLS session exists, so
 * there is no session to authenticate with. It only ever confirms a hostname
 * the operator has already published in public DNS, and never reveals one —
 * unknown domains are indistinguishable from unconfigured ones.
 */
export async function GET(req: Request) {
  const domain = normalizeCustomDomain(new URL(req.url).searchParams.get("domain"));
  if (!domain) return NextResponse.json({ ok: false }, { status: 400 });

  const rl = rateLimit(`domain-check:${clientIp(req)}`, { limit: 120, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const site = await db.careerSite.findUnique({
    where: { customDomain: domain },
    select: { workspaceId: true, verifiedAt: true, workspace: { select: { slug: true } } },
  });
  if (!site) return NextResponse.json({ ok: false }, { status: 404 });

  // A request actually arriving on this hostname is proof the DNS record is
  // live — that's what the "CNAME pending / CNAME live" chip on the career
  // preview reads. Stamped out of band so Caddy's ask never waits on a write.
  if (!site.verifiedAt || Date.now() - site.verifiedAt.getTime() > VERIFY_STAMP_MS) {
    after(async () => {
      try {
        await db.careerSite.update({
          where: { workspaceId: site.workspaceId },
          data: { verifiedAt: new Date() },
        });
      } catch (err) {
        log.warn("could not stamp verifiedAt for %s:", domain, err);
      }
    });
  }

  return NextResponse.json({ ok: true, slug: site.workspace.slug });
}
