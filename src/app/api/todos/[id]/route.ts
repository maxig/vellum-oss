// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// /api/todos/[id] — toggle/edit/delete a to-do.
// Only the creator or the assignee may mutate it (admins too).

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/permissions";

const Patch = z.object({
  done: z.boolean().optional(),
  title: z.string().min(1).max(2000).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  assigneeId: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { workspace, user, membership } = await requireWorkspace();
  const { id } = await params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const todo = await db.todo.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!todo) return NextResponse.json({ error: "not found" }, { status: 404 });
  const mine = todo.creatorId === user.id || todo.assigneeId === user.id;
  if (!mine && !isAdmin(membership.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title.trim();
  if (parsed.data.dueAt !== undefined) data.dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  if (parsed.data.done !== undefined) {
    data.done = parsed.data.done;
    data.doneAt = parsed.data.done ? new Date() : null;
  }
  if (parsed.data.assigneeId !== undefined && parsed.data.assigneeId !== todo.assigneeId) {
    const member = await db.membership.findFirst({
      where: { userId: parsed.data.assigneeId, workspaceId: workspace.id },
      select: { userId: true },
    });
    if (!member) return NextResponse.json({ error: "bad assignee" }, { status: 400 });
    data.assigneeId = parsed.data.assigneeId;
  }

  await db.todo.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { workspace, user, membership } = await requireWorkspace();
  const { id } = await params;

  const todo = await db.todo.findFirst({ where: { id, workspaceId: workspace.id }, select: { creatorId: true, assigneeId: true } });
  if (!todo) return NextResponse.json({ error: "not found" }, { status: 404 });
  const mine = todo.creatorId === user.id || todo.assigneeId === user.id;
  if (!mine && !isAdmin(membership.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await db.todo.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
