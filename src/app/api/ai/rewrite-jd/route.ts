// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { rewriteJobDescription } from "@/lib/ai";

/**
 * Either the caller passes `title` directly (new-job wizard, where the role
 * doesn't exist yet) OR they pass `jobId` and we recover the title from the
 * Job row (job detail page, where the user is editing an existing posting).
 */
const Body = z.object({
  title: z.string().trim().min(1).optional(),
  rough: z.string().default(""),
  jobId: z.string().optional(),
});

export async function POST(req: Request) {
  const { workspace } = await requireWorkspace();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let { title } = parsed.data;
  const { rough, jobId } = parsed.data;

  if (!title && jobId) {
    const job = await db.job.findFirst({
      where: { id: jobId, workspaceId: workspace.id },
      select: { title: true },
    });
    if (job?.title) title = job.title;
  }

  if (!title) {
    return NextResponse.json(
      { error: "AI rewrite needs a job title (pass `title`, or a valid `jobId` to look it up)." },
      { status: 400 },
    );
  }

  const r = await rewriteJobDescription(workspace.id, { title, rough });
  return NextResponse.json({ text: r.text, mocked: r.mocked });
}
