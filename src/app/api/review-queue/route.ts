// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// GET /api/review-queue
//
// Returns the current user's cached review queue. Two-stage model:
//
//   1. Read the cache row (workspace-wide item set).
//   2. If absent → synchronous build, deduped against any concurrent
//      cold-start GET via buildReviewQueueDeduped. This is the only
//      path that BLOCKS the response on a build.
//   3. If stale (older than CACHE_TTL_MS or rulesHash mismatch from a
//      rules edit) → return what we have, kick off a background
//      rebuild so the next poll sees fresh data.
//   4. If fresh → return as-is.
//
// Scope is NOT part of the cache key — the cache is workspace-wide
// and we filter by the user's effective scope at the very end. That
// way flipping Mine ↔ Whole workspace is instant and never invalidates
// the cache.

import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import {
  buildReviewQueueDeduped,
  readCachedQueue,
  resolveRules,
  hashRules,
  tryScheduleBackgroundBuild,
  applyScope,
  resolveEffectiveScope,
  type ReviewQueueItem,
} from "@/lib/review-queue";
import { emit } from "@/lib/review-queue-telemetry";
import { db } from "@/lib/db";

function bucketCounts(items: { bucketId: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) out[it.bucketId] = (out[it.bucketId] || 0) + 1;
  return out;
}

export const dynamic = "force-dynamic";

export async function GET() {
  const { workspace, user, membership } = await requireWorkspace();

  const cfg = await db.aIConfig.findUnique({
    where: { workspaceId: workspace.id },
    select: { reviewRules: true },
  });
  const rules = resolveRules(membership.role, cfg?.reviewRules);
  const currentHash = hashRules(rules);
  // Workspace scope is owner/admin-only — see ROLES.md. Regardless of
  // what the user persisted as their preference (or what the client
  // requests), members are always pinned to "mine". This is the server-
  // side enforcement; the UI also hides the toggle for non-admins, but
  // the gate has to be server-side too because the client is untrusted.
  const requested = await resolveEffectiveScope(user.id, rules.scope);
  const scope: "mine" | "workspace" =
    requested === "workspace" && (membership.role === "owner" || membership.role === "admin")
      ? "workspace"
      : "mine";

  const cached = await readCachedQueue(workspace.id, user.id, currentHash);
  if (!cached) {
    // Cold start. Multiple concurrent GETs (topbar count + sidebar CTA
    // + sheet open) all coalesce into a single build via the dedupe
    // helper. Without dedupe, each would spawn its own AI call.
    const result = await buildReviewQueueDeduped({ workspaceId: workspace.id, userId: user.id });
    const filtered = applyScope(result.items, scope, user.id);
    emit("review_queue.cache_miss", { workspaceId: workspace.id, userId: user.id, cause: "cold" });
    emit("review_queue.opened", {
      workspaceId: workspace.id,
      userId: user.id,
      itemCount: filtered.length,
      urgentCount: filtered.filter((it) => it.urgent).length,
      bucketCounts: bucketCounts(filtered),
      userScope: scope,
    });
    return NextResponse.json({
      items: filtered,
      builtAt: result.builtAt.toISOString(),
      stale: false,
      aiState: result.aiState,
      scope,
      canSeeWorkspace: membership.role === "owner" || membership.role === "admin",
      coldStart: true,
    });
  }

  const rawItems = cached.items as ReviewQueueItem[];

  if (cached.stale) {
    emit("review_queue.cache_miss", {
      workspaceId: workspace.id,
      userId: user.id,
      cause: cached.rulesHash !== currentHash ? "rules_changed" : "stale",
      ageMinutes: Math.round((Date.now() - cached.builtAt.getTime()) / 60000),
      refreshing: cached.refreshing,
    });
    if (!cached.refreshing) {
      tryScheduleBackgroundBuild(workspace.id, user.id);
    }
  } else {
    emit("review_queue.cache_hit", {
      workspaceId: workspace.id,
      userId: user.id,
      ageMinutes: Math.round((Date.now() - cached.builtAt.getTime()) / 60000),
      itemCount: rawItems.length,
    });
  }

  const filtered = applyScope(rawItems, scope, user.id);
  emit("review_queue.opened", {
    workspaceId: workspace.id,
    userId: user.id,
    itemCount: filtered.length,
    urgentCount: filtered.filter((it) => it.urgent).length,
    bucketCounts: bucketCounts(filtered),
    userScope: scope,
  });
  return NextResponse.json({
    items: filtered,
    builtAt: cached.builtAt.toISOString(),
    stale: cached.stale,
    aiState: cached.aiState,
    scope,
    canSeeWorkspace: membership.role === "owner" || membership.role === "admin",
  });
}
