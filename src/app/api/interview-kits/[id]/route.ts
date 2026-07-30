// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// /api/interview-kits/[id] — update or delete a scorecard template.
// Admin/owner only. PATCH replaces the item set wholesale (the editor
// sends the full desired list), which keeps positions coherent.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/permissions";
import { resolveStageKey, serializeKit } from "../route";

const ItemInput = z.object({
  label: z.string().min(1).max(200),
  hint: z.string().max(1000).nullable().optional(),
  kind: z.enum(["rating", "text", "yesno"]).default("rating"),
});
const UpdateKit = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  stageKey: z.string().max(60).nullable().optional(),
  archived: z.boolean().optional(),
  items: z.array(ItemInput).max(30).default([]),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { workspace, membership } = await requireWorkspace();
  if (!isAdmin(membership.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const parsed = UpdateKit.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const existing = await db.interviewKit.findFirst({ where: { id, workspaceId: workspace.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const stageKey = await resolveStageKey(workspace.id, parsed.data.stageKey);

  // Replace the item set atomically: drop the old rows, recreate from the
  // submitted list in order. Debriefs snapshot criteria at save time, so
  // rewriting the template's items never rewrites historical answers.
  await db.$transaction([
    db.interviewKitItem.deleteMany({ where: { kitId: id } }),
    db.interviewKit.update({
      where: { id },
      data: {
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        stageKey,
        archived: parsed.data.archived ?? undefined,
        items: {
          create: parsed.data.items.map((it, i) => ({
            label: it.label.trim(),
            hint: it.hint?.trim() || null,
            kind: it.kind,
            position: i,
          })),
        },
      },
    }),
  ]);

  const kit = await db.interviewKit.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { items: { orderBy: { position: "asc" } } },
  });
  return NextResponse.json({ ok: true, kit: kit ? serializeKit(kit) : null });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { workspace, membership } = await requireWorkspace();
  if (!isAdmin(membership.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;

  const existing = await db.interviewKit.findFirst({ where: { id, workspaceId: workspace.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // InterviewDebrief.kitId is SetNull — deleting a template keeps historical
  // debriefs (their criteria snapshot lives on the debrief itself).
  await db.interviewKit.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
