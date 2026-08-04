// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { token as makeToken } from "@/lib/utils";
import { logger } from "@/lib/log";

const log = logger("vellum");

const Body = z.object({ email: z.string().email(), role: z.enum(["member", "admin"]).default("member") });

export async function POST(req: Request) {
  const { workspace, user, membership } = await requireWorkspace();
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const email = parsed.data.email.toLowerCase();

  const token = makeToken(24);
  const expires = new Date(Date.now() + 14 * 86400_000);
  const invite = await db.invite.create({
    data: {
      workspaceId: workspace.id,
      email,
      role: parsed.data.role,
      token,
      invitedById: user.id,
      expiresAt: expires,
    },
  });

  const url = `${process.env.APP_ORIGIN || "http://localhost:3000"}/invite/${token}`;
  // Dev convenience only — the invite URL is a bearer token, so never write it
  // to production logs (it's already returned in the response for the UI).
  if (process.env.NODE_ENV !== "production") {
    // debug, not trace: `debug` is the default level outside production, so
    // this keeps printing for developers exactly as it did before. At trace it
    // would have gone silent unless LOG_LEVEL was raised by hand.
    log.debug(`\n📨 INVITE for ${email} to ${workspace.name}:\n   ${url}\n`);
  }
  return NextResponse.json({ id: invite.id, token, url });
}
