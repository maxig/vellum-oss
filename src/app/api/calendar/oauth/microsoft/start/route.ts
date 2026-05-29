// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { requireWorkspace } from "@/lib/workspace";
import { buildAuthUrl, microsoftConfigured } from "@/lib/microsoft-calendar";

export async function GET() {
  const { workspace, user } = await requireWorkspace();
  if (!microsoftConfigured()) {
    return NextResponse.json(
      { error: "MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET must be set on the server" },
      { status: 503 },
    );
  }

  const nonce = randomBytes(16).toString("hex");
  const state = `${nonce}.${workspace.id}.${user.id}`;
  const c = await cookies();
  c.set("vellum_oauth_microsoft", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const url = await buildAuthUrl(state);
  return NextResponse.redirect(url);
}
