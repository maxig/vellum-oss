// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// /api/applications/[id]/rating — quick 1–5 star team review.
//
// One rating per (author, application): POST upserts the caller's own
// score, DELETE removes it. Distinct from InterviewDebrief — this is the
// lightweight "how do you rate this candidate?" that drives the star
// aggregate on cards/lists/profile. Anyone who can READ the application
// (reviewer, hiring team, interviewer, admin) can leave their opinion.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { canReadApplication } from "@/lib/permissions";

const Body = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(2000).nullable().optional(),
});

// Workspace average + count for this application, rounded to 1 decimal.
async function aggregate(applicationId: string) {
  const agg = await db.rating.aggregate({
    where: { applicationId },
    _avg: { score: true },
    _count: { _all: true },
  });
  return {
    avg: agg._avg.score != null ? Math.round(agg._avg.score * 10) / 10 : null,
    count: agg._count._all,
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { workspace, user, membership } = await requireWorkspace();
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const app = await db.application.findFirst({
    where: { id, workspaceId: workspace.id },
    select: { id: true, candidateId: true, candidate: { select: { name: true } } },
  });
  if (!app) return NextResponse.json({ error: "not found" }, { status: 404 });

  const allowed = await canReadApplication(user.id, id, workspace.id, membership.role);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const comment = parsed.data.comment?.trim() || null;
  // Upsert on the (application, author) unique key — atomic, so two fast
  // clicks can't both insert and trip a P2002 (they previously 500'd).
  const rating = await db.rating.upsert({
    where: { applicationId_authorId: { applicationId: id, authorId: user.id } },
    create: {
      workspaceId: workspace.id,
      applicationId: id,
      candidateId: app.candidateId,
      authorId: user.id,
      score: parsed.data.score,
      comment,
    },
    update: { score: parsed.data.score, comment },
  });

  // Log an activity only on a first rating — edits shouldn't spam the
  // timeline every time someone nudges a star. On a fresh insert
  // createdAt === updatedAt; an update bumps updatedAt.
  if (rating.createdAt.getTime() === rating.updatedAt.getTime()) {
    await db.activity
      .create({
        data: {
          workspaceId: workspace.id,
          actorId: user.id,
          actorName: user.name || user.email,
          kind: "rated",
          icon: "Star",
          body: `Rated ${app.candidate.name} ${parsed.data.score}/5`,
          candidateId: app.candidateId,
        },
      })
      .catch(() => null);
  }

  return NextResponse.json({ ok: true, id: rating.id, myScore: rating.score, ...(await aggregate(id)) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { workspace, user, membership } = await requireWorkspace();
  const { id } = await params;

  const app = await db.application.findFirst({
    where: { id, workspaceId: workspace.id },
    select: { id: true },
  });
  if (!app) return NextResponse.json({ error: "not found" }, { status: 404 });

  const allowed = await canReadApplication(user.id, id, workspace.id, membership.role);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // deleteMany (not delete) so removing a rating you never left is a no-op
  // rather than a 500.
  await db.rating.deleteMany({ where: { applicationId: id, authorId: user.id } });

  return NextResponse.json({ ok: true, myScore: null, ...(await aggregate(id)) });
}
