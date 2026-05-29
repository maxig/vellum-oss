// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// /api/interviews/[id]/debrief — post-interview structured feedback.
//
// One-to-one with the interview row. The recap engine reads this to render
// the `interview_outcomes` item. Pulse reads `recommend: "no" | "strong_no"`
// to fire a `negative_sentiment` signal on the candidate when set.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { recordSignal } from "@/lib/pulse";

const Body = z.object({
  pros: z.string().max(4000).optional().nullable(),
  cons: z.string().max(4000).optional().nullable(),
  sentiment: z.enum(["positive", "neutral", "negative", "mixed"]).default("neutral"),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  recommend: z.enum(["strong_yes", "yes", "maybe", "no", "strong_no"]).nullable().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { workspace, user } = await requireWorkspace();
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const interview = await db.interview.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { application: true },
  });
  if (!interview) return NextResponse.json({ error: "not found" }, { status: 404 });

  const debrief = await db.interviewDebrief.upsert({
    where: { interviewId: id },
    create: {
      interviewId: id,
      workspaceId: workspace.id,
      authorId: user.id,
      pros: parsed.data.pros || null,
      cons: parsed.data.cons || null,
      sentiment: parsed.data.sentiment,
      rating: parsed.data.rating ?? null,
      recommend: parsed.data.recommend ?? null,
    },
    update: {
      pros: parsed.data.pros || null,
      cons: parsed.data.cons || null,
      sentiment: parsed.data.sentiment,
      rating: parsed.data.rating ?? null,
      recommend: parsed.data.recommend ?? null,
    },
  });

  // Mark the interview as done if it wasn't already — recruiters expect
  // submitting a debrief to close the loop.
  if (interview.status === "scheduled") {
    await db.interview.update({ where: { id }, data: { status: "done" } });
  }

  // Feed Pulse — negative recommendation maps to a negative sentiment
  // signal on the candidate; positive doesn't auto-push (we don't want
  // debrief enthusiasm to disguise the candidate's actual engagement).
  if (parsed.data.recommend === "no" || parsed.data.recommend === "strong_no") {
    await recordSignal({
      workspaceId: workspace.id,
      candidateId: interview.application.candidateId,
      kind: "negative_sentiment",
      source: "system",
      evidence: { interviewId: id, debriefId: debrief.id, recommend: parsed.data.recommend },
    }).catch(() => null);
  }

  return NextResponse.json({ ok: true, id: debrief.id });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { workspace } = await requireWorkspace();
  const { id } = await params;
  const debrief = await db.interviewDebrief.findFirst({
    where: { interviewId: id, workspaceId: workspace.id },
    include: { author: { select: { name: true, email: true } } },
  });
  if (!debrief) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(debrief);
}
