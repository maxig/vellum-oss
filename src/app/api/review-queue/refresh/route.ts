// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// POST /api/review-queue/refresh
//
// Manual rebuild — runs synchronously and returns the new cache row.
// Rate-limited to 1 per minute per (workspace, user) per spec §8.2.
// Rate limit is enforced via a stamp on the cache row itself: we look
// at the cached `builtAt` and refuse if it's < 60s old AND `refreshing`
// is false. The `refreshing` flag covers the in-flight case.

import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import {
  buildReviewQueueDeduped,
  applyScope,
  resolveEffectiveScope,
  resolveRules,
} from "@/lib/review-queue";
import { emit } from "@/lib/review-queue-telemetry";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const MIN_INTERVAL_MS = 60 * 1000;

export async function POST() {
  const { workspace, user, membership } = await requireWorkspace();

  const existing = await db.reviewQueueCache.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    select: { builtAt: true, refreshing: true },
  });

  if (existing) {
    if (existing.refreshing) {
      return NextResponse.json(
        { error: "in_flight", message: "Another refresh is already running." },
        { status: 429 },
      );
    }
    const age = Date.now() - existing.builtAt.getTime();
    if (age < MIN_INTERVAL_MS) {
      const retryAfter = Math.ceil((MIN_INTERVAL_MS - age) / 1000);
      return NextResponse.json(
        { error: "rate_limited", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
  }

  const cfg = await db.aIConfig.findUnique({
    where: { workspaceId: workspace.id },
    select: { reviewRules: true },
  });
  const rules = resolveRules(membership.role, cfg?.reviewRules);
  // Members are pinned to "mine"; only owners/admins see workspace.
  const requested = await resolveEffectiveScope(user.id, rules.scope);
  const scope: "mine" | "workspace" =
    requested === "workspace" && (membership.role === "owner" || membership.role === "admin")
      ? "workspace"
      : "mine";

  const startedAt = Date.now();
  // Deduped — if a background rebuild is mid-flight (e.g. fired from
  // a GET that saw stale), this caller shares its promise instead of
  // launching a second AI call.
  const result = await buildReviewQueueDeduped({ workspaceId: workspace.id, userId: user.id });
  const filtered = applyScope(result.items, scope, user.id);
  emit("review_queue.refresh_manual", {
    workspaceId: workspace.id,
    userId: user.id,
    durationMs: Date.now() - startedAt,
    itemCount: filtered.length,
    aiState: result.aiState,
  });
  return NextResponse.json({
    items: filtered,
    builtAt: result.builtAt.toISOString(),
    stale: false,
    aiState: result.aiState,
    scope,
  });
}
