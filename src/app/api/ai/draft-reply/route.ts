// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { draftReply } from "@/lib/ai";

const Body = z.object({ threadId: z.string().min(1) });

export async function POST(req: Request) {
  const { workspace } = await requireWorkspace();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "draft-reply expects { threadId }. For free-form prompts (e.g. agenda suggestions) use /api/ai/complete instead.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const t = await db.thread.findFirst({
    where: { id: parsed.data.threadId, workspaceId: workspace.id },
    include: {
      candidate: true,
      messages: { orderBy: { createdAt: "desc" }, take: 5 },
      job: { include: { applications: { where: { candidate: { workspaceId: workspace.id } }, include: { stage: true } } } },
    },
  });
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });

  const lastIncoming = t.messages.find((m) => m.direction === "in") || t.messages[0];
  const stage = t.job?.applications.find((a) => a.candidateId === t.candidateId)?.stage?.name || "Applied";
  const r = await draftReply(workspace.id, {
    candidateName: t.candidate.name,
    lastMessage: lastIncoming?.body || "(no previous message)",
    stage,
  });
  return NextResponse.json({ text: r.text, mocked: r.mocked });
}
