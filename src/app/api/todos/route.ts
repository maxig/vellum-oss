// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// /api/todos — manual to-dos (distinct from the derived FollowUp SLAs).
//
// GET  ?candidateId=… → every to-do pinned to that candidate (the drawer tab)
// GET  (no params)    → to-dos I own: assigned to me OR created by me
// POST                → create one (defaults to self-assigned)
//
// Any workspace member may create/read their own to-dos. Candidate/application
// links are verified to belong to the workspace before being stored.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { canReadCandidate } from "@/lib/permissions";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const Create = z.object({
  title: z.string().min(1).max(2000),
  assigneeId: z.string().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  candidateId: z.string().nullable().optional(),
  applicationId: z.string().nullable().optional(),
});

const todoInclude = {
  creator: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
  candidate: { select: { id: true, name: true } },
  application: { select: { id: true, job: { select: { title: true } } } },
} satisfies Prisma.TodoInclude;

type TodoRow = Prisma.TodoGetPayload<{ include: typeof todoInclude }>;

export function serializeTodo(t: TodoRow) {
  return {
    id: t.id,
    title: t.title,
    done: t.done,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    doneAt: t.doneAt ? t.doneAt.toISOString() : null,
    creatorId: t.creatorId,
    creatorName: t.creator.name || t.creator.email,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee.name || t.assignee.email,
    candidateId: t.candidateId,
    candidateName: t.candidate?.name ?? null,
    applicationId: t.applicationId,
    jobTitle: t.application?.job.title ?? null,
    createdAt: t.createdAt.toISOString(),
  };
}

export async function GET(req: Request) {
  const { workspace, user, membership } = await requireWorkspace();
  const candidateId = new URL(req.url).searchParams.get("candidateId");

  // The candidate-scoped list (drawer tab) exposes to-do titles that can carry
  // assessment notes, so it needs the same per-member read gate as the sheet.
  if (candidateId && !(await canReadCandidate(user.id, candidateId, workspace.id, membership.role))) {
    return NextResponse.json({ todos: [], me: user.id });
  }

  const where: Prisma.TodoWhereInput = candidateId
    ? { workspaceId: workspace.id, candidateId }
    : { workspaceId: workspace.id, OR: [{ assigneeId: user.id }, { creatorId: user.id }] };

  const todos = await db.todo.findMany({
    where,
    include: todoInclude,
    // Open first, then by due date (undated last), newest created as tiebreak.
    orderBy: [{ done: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 200,
  });

  return NextResponse.json({ todos: todos.map(serializeTodo), me: user.id });
}

export async function POST(req: Request) {
  const { workspace, user } = await requireWorkspace();
  const parsed = Create.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const { title, dueAt } = parsed.data;

  // Assignee defaults to self; if set to someone else, verify they're a member.
  let assigneeId = user.id;
  if (parsed.data.assigneeId && parsed.data.assigneeId !== user.id) {
    const member = await db.membership.findFirst({
      where: { userId: parsed.data.assigneeId, workspaceId: workspace.id },
      select: { userId: true },
    });
    if (!member) return NextResponse.json({ error: "bad assignee" }, { status: 400 });
    assigneeId = parsed.data.assigneeId;
  }

  // Verify any candidate/application link belongs to this workspace.
  let candidateId: string | null = null;
  let applicationId: string | null = null;
  if (parsed.data.candidateId) {
    const c = await db.candidate.findFirst({ where: { id: parsed.data.candidateId, workspaceId: workspace.id }, select: { id: true } });
    candidateId = c?.id ?? null;
  }
  if (parsed.data.applicationId) {
    const a = await db.application.findFirst({ where: { id: parsed.data.applicationId, workspaceId: workspace.id }, select: { id: true, candidateId: true } });
    applicationId = a?.id ?? null;
    // Backfill the candidate from the application so drawer todos always link.
    if (a && !candidateId) candidateId = a.candidateId;
  }

  const todo = await db.todo.create({
    data: {
      workspaceId: workspace.id,
      creatorId: user.id,
      assigneeId,
      title: title.trim(),
      dueAt: dueAt ? new Date(dueAt) : null,
      candidateId,
      applicationId,
    },
    include: todoInclude,
  });

  // Notify the assignee when it's not the creator — unless they've turned
  // to-do notifications off in their preferences.
  if (assigneeId !== user.id) {
    const pref = await db.userPreference.findUnique({ where: { userId: assigneeId }, select: { notifications: true } });
    const notifs = (pref?.notifications as Record<string, unknown> | null) || {};
    const wants = notifs.notifyTodoAssigned !== false; // default on
    if (wants)
    await db.notification
      .create({
        data: {
          workspaceId: workspace.id,
          userId: assigneeId,
          kind: "todo",
          title: `${user.name || user.email} assigned you a to-do`,
          body: title.trim().slice(0, 140),
          icon: "ListChecks",
          candidateId,
          jobId: null,
        },
      })
      .catch(() => null);
  }

  return NextResponse.json({ ok: true, todo: serializeTodo(todo) });
}
