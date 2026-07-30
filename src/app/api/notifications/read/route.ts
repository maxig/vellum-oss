// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// POST /api/notifications/read — mark one ({ id }) or all (no id) of the
// current user's notifications as read. Scoped to the caller so one user
// can never clear another's badge.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";

const Body = z.object({ id: z.string().optional() });

export async function POST(req: Request) {
  const { workspace, user } = await requireWorkspace();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  await db.notification.updateMany({
    where: {
      workspaceId: workspace.id,
      userId: user.id,
      read: false,
      ...(parsed.data.id ? { id: parsed.data.id } : {}),
    },
    data: { read: true },
  });

  return NextResponse.json({ ok: true });
}
