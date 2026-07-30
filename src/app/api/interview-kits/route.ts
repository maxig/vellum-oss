// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// /api/interview-kits — scorecard templates (Settings → Interview kits).
//
// GET: any workspace member (interviewers need to read the kit when
// writing a debrief). POST: admin/owner only — these are shared templates.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/permissions";

const ItemInput = z.object({
  label: z.string().min(1).max(200),
  hint: z.string().max(1000).nullable().optional(),
  kind: z.enum(["rating", "text", "yesno"]).default("rating"),
});
const CreateKit = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  stageKey: z.string().max(60).nullable().optional(),
  items: z.array(ItemInput).max(30).default([]),
});

export async function GET() {
  const { workspace } = await requireWorkspace();
  const [kits, stages] = await Promise.all([
    db.interviewKit.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: { items: { orderBy: { position: "asc" } } },
    }),
    db.stage.findMany({ where: { workspaceId: workspace.id }, orderBy: { position: "asc" }, select: { key: true, name: true } }),
  ]);
  return NextResponse.json({
    kits: kits.map(serializeKit),
    stages: stages.map((s) => ({ key: s.key, name: s.name })),
  });
}

export async function POST(req: Request) {
  const { workspace, membership } = await requireWorkspace();
  if (!isAdmin(membership.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = CreateKit.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const stageKey = await resolveStageKey(workspace.id, parsed.data.stageKey);
  const count = await db.interviewKit.count({ where: { workspaceId: workspace.id } });

  const kit = await db.interviewKit.create({
    data: {
      workspaceId: workspace.id,
      name: parsed.data.name.trim(),
      description: parsed.data.description?.trim() || null,
      stageKey,
      position: count,
      items: {
        create: parsed.data.items.map((it, i) => ({
          label: it.label.trim(),
          hint: it.hint?.trim() || null,
          kind: it.kind,
          position: i,
        })),
      },
    },
    include: { items: { orderBy: { position: "asc" } } },
  });
  return NextResponse.json({ ok: true, kit: serializeKit(kit) });
}

// Keep stageKey honest: only store it if it matches a real workspace stage,
// otherwise treat the kit as general (null).
export async function resolveStageKey(workspaceId: string, stageKey: string | null | undefined) {
  if (!stageKey) return null;
  const stage = await db.stage.findFirst({ where: { workspaceId, key: stageKey }, select: { key: true } });
  return stage?.key ?? null;
}

type KitWithItems = {
  id: string;
  name: string;
  description: string | null;
  stageKey: string | null;
  archived: boolean;
  items: { id: string; label: string; hint: string | null; kind: string; position: number }[];
};
export function serializeKit(kit: KitWithItems) {
  return {
    id: kit.id,
    name: kit.name,
    description: kit.description,
    stageKey: kit.stageKey,
    archived: kit.archived,
    items: kit.items.map((it) => ({ id: it.id, label: it.label, hint: it.hint, kind: it.kind })),
  };
}
