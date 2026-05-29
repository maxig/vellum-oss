// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";

const Body = z.object({
  candidateId: z.string(),
  jobId: z.string().optional().nullable(),
  subject: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  const { workspace } = await requireWorkspace();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const c = await db.candidate.findFirst({ where: { id: parsed.data.candidateId, workspaceId: workspace.id } });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const t = await db.thread.create({
    data: {
      workspaceId: workspace.id,
      candidateId: parsed.data.candidateId,
      jobId: parsed.data.jobId || null,
      subject: parsed.data.subject,
      lastAt: new Date(),
    },
  });
  return NextResponse.json({ id: t.id });
}
