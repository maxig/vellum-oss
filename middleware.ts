// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse, type NextRequest } from "next/server";
import { isAppHost } from "@/lib/app-host";

const PUBLIC_PATHS = [
  "/_next",
  "/api",
  "/favicon.ico",
  "/uploads",
  "/login",
  "/signup",
  "/invite",
  "/onboarding",
];

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const url = req.nextUrl.clone();
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
    if (url.pathname.startsWith("/_next") || url.pathname.startsWith("/api") || url.pathname.startsWith("/uploads")) {
      return NextResponse.next();
    }
    // Rewrite "/" → "/careers/<slug>", "/jobs/<x>" → "/careers/<slug>/jobs/<x>", etc.
    if (!url.pathname.startsWith(`/careers/${slug}`)) {
      const rest = url.pathname === "/" ? "" : url.pathname;
      url.pathname = `/careers/${slug}${rest}`;
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
