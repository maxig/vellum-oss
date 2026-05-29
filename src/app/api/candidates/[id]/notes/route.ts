// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { sanitizeRichText, stripHtml } from "@/lib/sanitize";

const Body = z.object({ body: z.string().min(1).max(8000) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { workspace, user } = await requireWorkspace();
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const c = await db.candidate.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });

  const clean = sanitizeRichText(parsed.data.body);
  if (!stripHtml(clean).trim()) {
    return NextResponse.json({ error: "Note cannot be empty." }, { status: 400 });
  }
  const note = await db.note.create({
    data: { workspaceId: workspace.id, candidateId: id, authorId: user.id, body: clean },
  });
  await db.activity.create({
    data: {
      workspaceId: workspace.id,
      actorId: user.id,
      actorName: user.name || user.email,
      kind: "noted",
      icon: "FileText",
      body: `Left a note on ${c.name}`,
      candidateId: c.id,
    },
  });
  return NextResponse.json({ id: note.id });
}
