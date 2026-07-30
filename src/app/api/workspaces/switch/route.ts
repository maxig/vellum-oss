// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const Body = z.object({ workspaceId: z.string() });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const membership = await db.membership.findUnique({
    where: { userId_workspaceId: { userId: session.user.id, workspaceId: parsed.data.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const c = await cookies();
  c.set("vellum_ws", parsed.data.workspaceId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
  await db.userPreference.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, lastWorkspace: parsed.data.workspaceId },
    update: { lastWorkspace: parsed.data.workspaceId },
  });
  return NextResponse.json({ ok: true });
}
