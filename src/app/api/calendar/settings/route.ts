// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace, isAdmin } from "@/lib/workspace";
import { db } from "@/lib/db";

const Body = z.object({
  workHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  workHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  workDays: z.array(z.number().int().min(0).max(6)).optional(),
  timezone: z.string().optional(),
  defaultInterviewKind: z.enum(["phone", "video", "onsite", "panel"]).optional(),
  allowPersonalCalendars: z.boolean().optional(),
  followupReplyHours: z.number().int().min(1).max(168).optional(),
  followupDecideHours: z.number().int().min(1).max(168).optional(),
  followupRejectionHours: z.number().int().min(1).max(168).optional(),
  followupDebriefHours: z.number().int().min(1).max(168).optional(),
  followupOfferNudgeDays: z.number().int().min(1).max(30).optional(),
  followupReferenceSlaDays: z.number().int().min(1).max(30).optional(),
});

export async function PATCH(req: Request) {
  const { workspace, membership } = await requireWorkspace();
  if (!isAdmin(membership.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  // Workspace-level shape — merge with existing JSON.
  const current = (workspace as any).calendarSettings || {};
  const mergedSettings: Record<string, unknown> = {
    ...current,
    workHours: {
      start: parsed.data.workHoursStart ?? current.workHours?.start ?? "08:00",
      end: parsed.data.workHoursEnd ?? current.workHours?.end ?? "19:00",
    },
    workDays: parsed.data.workDays ?? current.workDays ?? [1, 2, 3, 4, 5],
    timezone: parsed.data.timezone ?? current.timezone ?? workspace.timezone,
    defaultInterviewKind: parsed.data.defaultInterviewKind ?? current.defaultInterviewKind ?? "video",
    allowPersonalCalendars:
      parsed.data.allowPersonalCalendars ?? current.allowPersonalCalendars ?? true,
  };

  await db.workspace.update({
    where: { id: workspace.id },
    data: { calendarSettings: mergedSettings as any },
  });

  // SLA fields live on AIConfig — only update keys the request actually sent.
  const slaUpdates: any = {};
  for (const k of [
    "followupReplyHours",
    "followupDecideHours",
    "followupRejectionHours",
    "followupDebriefHours",
    "followupOfferNudgeDays",
    "followupReferenceSlaDays",
  ] as const) {
    if (parsed.data[k] !== undefined) slaUpdates[k] = parsed.data[k];
  }
  if (Object.keys(slaUpdates).length > 0) {
    await db.aIConfig.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, ...slaUpdates },
      update: slaUpdates,
    });
  }

  return NextResponse.json({ ok: true });
}
