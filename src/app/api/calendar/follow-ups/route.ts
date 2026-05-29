// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { syncFollowUps } from "@/lib/follow-ups";

export async function GET() {
  const { workspace, user } = await requireWorkspace();
  const items = await db.followUp.findMany({
    where: { workspaceId: workspace.id, userId: user.id, state: "active" },
    include: { application: { include: { candidate: true, job: true } } },
    orderBy: { dueAt: "asc" },
    take: 100,
  });
  return NextResponse.json({
    items: items.map((f) => ({
      id: f.id,
      kind: f.kind,
      dueAt: f.dueAt.toISOString(),
      reason: f.reason,
      ai: f.source === "ai",
      candidate: { id: f.application.candidate.id, name: f.application.candidate.name },
      job: { id: f.application.job.id, title: f.application.job.title },
      applicationId: f.applicationId,
    })),
  });
}

const Body = z.object({ action: z.enum(["dismiss", "done"]), id: z.string() });

export async function POST(req: Request) {
  const { workspace, user } = await requireWorkspace();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const f = await db.followUp.findFirst({
    where: { id: parsed.data.id, workspaceId: workspace.id, userId: user.id },
  });
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db.followUp.update({
    where: { id: f.id },
    data: { state: parsed.data.action === "dismiss" ? "dismissed" : "done" },
  });
  return NextResponse.json({ ok: true });
}

export async function PUT() {
  // Manual rebuild for the current workspace. Useful from the calendar
  // view's refresh button while we don't have realtime push yet.
  const { workspace } = await requireWorkspace();
  const result = await syncFollowUps(workspace.id);
  return NextResponse.json(result);
}
