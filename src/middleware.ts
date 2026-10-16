// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse, type NextRequest } from "next/server";
import { isAppHost } from "@/lib/app-host";
import { resolveCustomDomain } from "@/lib/custom-domain";

/** Paths owned by the app itself — never part of a career site's URL space. */
function isPassthrough(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname.startsWith("/uploads")
  );
}

/**
 * Request header naming the workspace whose public career site is being
 * rendered. src/i18n/request.ts reads it so candidates see the site in the
 * workspace's language. Always set (or stripped) here, never trusted from the
 * client.
 */
export const CAREER_SITE_HEADER = "x-vellum-career-site";

function careerHeaders(req: NextRequest, slug: string | null) {
  const headers = new Headers(req.headers);
  if (slug) headers.set(CAREER_SITE_HEADER, slug);
  else headers.delete(CAREER_SITE_HEADER);
  return headers;
}

/** Rewrite "/" → "/careers/<slug>", "/jobs/x" → "/careers/<slug>/jobs/x", etc. */
function toCareerSite(req: NextRequest, slug: string) {
  const url = req.nextUrl.clone();
  const request = { headers: careerHeaders(req, slug) };
  if (url.pathname.startsWith(`/careers/${slug}`)) return NextResponse.next({ request });
  const rest = url.pathname === "/" ? "" : url.pathname;
  url.pathname = `/careers/${slug}${rest}`;
  return NextResponse.rewrite(url, { request });
}

/** Pass through, tagging direct /careers/<slug> URLs and stripping a spoofed header. */
function passThrough(req: NextRequest) {
  const m = /^\/careers\/([^/]+)/.exec(req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: careerHeaders(req, m ? m[1] : null) } });
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const apex = (process.env.PUBLIC_DOMAIN || "localhost:3000").split(":")[0];
  const hostBare = host.split(":")[0];

  const isSubdomain =
    hostBare !== apex &&
    hostBare !== "127.0.0.1" &&
    // The admin app may live on a subdomain of the same apex (e.g.
    // vellum.example.com with PUBLIC_DOMAIN=example.com). Don't treat it as a
    // career-site workspace — let it fall through to the admin app.
    !isAppHost(hostBare) &&
    hostBare.endsWith("." + apex) &&
    hostBare.slice(0, hostBare.length - ("." + apex).length).length > 0;

  // If we're on a workspace subdomain, route everything (except API/_next) into the public career site.
  if (isSubdomain) {
    const slug = hostBare.slice(0, hostBare.length - ("." + apex).length);
    if (isPassthrough(req.nextUrl.pathname)) return NextResponse.next();
    return toCareerSite(req, slug);
  }

  // Not a workspace subdomain, not the admin app, not the apex — it may be a
  // workspace's own domain (careers.acme.com). That mapping only exists in the
  // database, so unlike the subdomain case above it costs a lookup; the guards
  // here keep it off every admin and localhost request, and the resolver
  // memoises both hits and misses.
  const couldBeCustom =
    hostBare.length > 0 &&
    hostBare !== apex &&
    hostBare !== "127.0.0.1" &&
    hostBare !== "localhost" &&
    !hostBare.endsWith(".localhost") &&
    !isAppHost(hostBare);

  if (couldBeCustom) {
    if (isPassthrough(req.nextUrl.pathname)) return NextResponse.next();
    const slug = await resolveCustomDomain(hostBare);
    if (slug) return toCareerSite(req, slug);
  }

  return passThrough(req);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
