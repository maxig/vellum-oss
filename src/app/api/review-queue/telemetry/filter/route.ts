// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// POST /api/review-queue/telemetry/filter
//
// Fire-and-forget client telemetry for §12's bucket_filter event. Body
// is { bucketId: string }. Returns 204 always — the client never blocks
// on this.

import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { emit } from "@/lib/review-queue-telemetry";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { workspace, user } = await requireWorkspace();
  let bucketId: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.bucketId === "string") bucketId = body.bucketId;
  } catch {
    // ignore — empty body is fine; just won't fire the event
  }
  if (bucketId) {
    emit("review_queue.bucket_filter", {
      workspaceId: workspace.id,
      userId: user.id,
      bucketId,
    });
  }
  return new NextResponse(null, { status: 204 });
}
