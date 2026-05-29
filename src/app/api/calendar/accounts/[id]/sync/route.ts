// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Synchronous "Sync now" for a connected calendar.
 *
 * Pulls a 90-day window into CalendarEventMirror and returns a count
 * (plus a small sample) so the Settings UI can immediately confirm
 * whether the connection produced any data. Used as the operator's
 * primary diagnostic — if a user hits Connect, lastPolledAt updates,
 * but no events show up on the grid, they can press Sync now and
 * find out what came back.
 */
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { pullMirror } from "@/lib/calendar-provider";

const WINDOW_DAYS = 90;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { workspace, user } = await requireWorkspace();
  const { id } = await ctx.params;
  const account = await db.calendarAccount.findFirst({
    where: { id, workspaceId: workspace.id, userId: user.id },
  });
  if (!account) return NextResponse.json({ error: "not found" }, { status: 404 });

  const from = new Date();
  // Reach back a few days so events that started yesterday but end today
  // (multi-day blocks) still show up on the grid.
  from.setDate(from.getDate() - 3);
  const to = new Date(Date.now() + WINDOW_DAYS * 86_400_000);

  try {
    const result = await pullMirror(id, from, to);
    // Pull a tiny sample for the UI to render.
    const sample = await db.calendarEventMirror.findMany({
      where: { accountId: id, startsAt: { gte: from, lte: to } },
      orderBy: { startsAt: "asc" },
      take: 5,
      select: { startsAt: true, endsAt: true, title: true, kind: true },
    });
    return NextResponse.json({
      ok: true,
      count: result.count,
      sample: sample.map((s) => ({
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        title: s.title,
        kind: s.kind,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "sync failed" },
      { status: 500 },
    );
  }
}
