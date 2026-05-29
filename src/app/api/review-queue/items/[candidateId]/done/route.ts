// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// POST /api/review-queue/items/[candidateId]/done
//
// Optimistic clear. Removes every queue item for this candidate from the
// current user's cache row. Does NOT recompute the queue — the next
// hourly worker tick is the consistent state. See §8.6 of
// REVIEW_QUEUE_FEATURE.md.

import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { markItemDone } from "@/lib/review-queue";
import { emit } from "@/lib/review-queue-telemetry";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ candidateId: string }> }) {
  const { workspace, user } = await requireWorkspace();
  const { candidateId } = await ctx.params;
  if (!candidateId) {
    return NextResponse.json({ error: "missing_candidate" }, { status: 400 });
  }
  // Optional client-side telemetry hints so the action event carries the
  // bucket and the action taken (instead of just "something was cleared").
  // The lib doesn't know what action led to the clear, so the client tells us.
  let bucketId: string | null = null;
  let action: string | null = null;
  let wasAI = false;
  try {
    const body = await req.json();
    if (typeof body?.bucketId === "string") bucketId = body.bucketId;
    if (typeof body?.action === "string") action = body.action;
    if (typeof body?.wasAI === "boolean") wasAI = body.wasAI;
  } catch {
    // No body or invalid JSON — fall through, server still does its job.
  }
  const removed = await markItemDone(workspace.id, user.id, candidateId);
  emit("review_queue.item_action", {
    workspaceId: workspace.id,
    userId: user.id,
    bucketId,
    action,
    wasAI,
    removed,
  });
  return NextResponse.json({ ok: true, removed });
}
