// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { buildAuthUrl, googleConfigured } from "@/lib/google-calendar";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";

export async function GET() {
  const { workspace, user } = await requireWorkspace();
  if (!googleConfigured()) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET must be set on the server" },
      { status: 503 },
    );
  }

  // Sign the state cookie so the callback can't be forged from outside this
  // session — workspace + user must match the cookie on return.
  const nonce = randomBytes(16).toString("hex");
  const state = `${nonce}.${workspace.id}.${user.id}`;
  const c = await cookies();
  c.set("vellum_oauth_google", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(buildAuthUrl(state));
}
