// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// POST /api/cookies/sweep
// Called by the consent banner immediately after the visitor saves a
// choice that denies one or more categories. Server-side deletes any
// first-party cookies whose category is no longer allowed (notably the
// httpOnly `vellum_anon` analytics cookie that the browser can't touch
// itself). Idempotent — safe to call when nothing needs deleting.
import { NextResponse } from "next/server";
import { sweepDeniedCookies } from "@/lib/consent";

export async function POST() {
  await sweepDeniedCookies();
  return NextResponse.json({ ok: true });
}
