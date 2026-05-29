// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const Body = z.object({
  theme: z.enum(["light", "dark"]).optional(),
  density: z.enum(["compact", "cozy"]).optional(),
  accent: z.string().optional(),
  glassIntensity: z.number().min(0.1).max(2).optional(),
  // null clears the override and falls back to the workspace default.
  reviewScope: z.enum(["mine", "workspace"]).nullable().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const data = parsed.data;
  await db.userPreference.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...data },
    update: data,
  });
  return NextResponse.json({ ok: true });
}
