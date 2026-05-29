// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// PATCH /api/review-queue/rules
//
// Updates AIConfig.reviewRules for the workspace. Admins and owners only.
// On success, invalidates every cache row in the workspace by clearing
// rulesHash — the next read will rebuild. See §6 + §8.5.
//
// The payload is intentionally permissive at the zod layer; the
// resolveRules() call in the lib does the actual range-clamping and
// shape-validation when the rules are next consumed.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace, isAdmin } from "@/lib/workspace";
import { db } from "@/lib/db";
import { resolveRules, hashRules, invalidateWorkspaceCache } from "@/lib/review-queue";
import { emit } from "@/lib/review-queue-telemetry";

const Patch = z
  .object({
    buckets: z.record(z.string(), z.object({
      enabled: z.boolean().optional(),
      severity: z.number().int().min(1).max(5).optional(),
      thresholds: z.record(z.string(), z.number()).optional(),
    })).optional(),
    scope: z.enum(["mine", "workspace"]).optional(),
    aiOverlay: z.object({
      enabled: z.boolean().optional(),
      maxItems: z.number().int().min(1).max(4).optional(),
    }).optional(),
  })
  .strict();

export async function PATCH(req: Request) {
  const { workspace, membership } = await requireWorkspace();
  if (!isAdmin(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_input", details: parsed.error.format() }, { status: 400 });
  }

  // Merge the patch over whatever's persisted, then re-validate through
  // resolveRules so we always store a normalized shape. Storing the
  // normalized blob means every reader sees the same defaults and the
  // settings UI can hydrate from the persisted shape verbatim.
  const existing = await db.aIConfig.findUnique({
    where: { workspaceId: workspace.id },
    select: { reviewRules: true },
  });
  const merged = mergeRules(existing?.reviewRules, parsed.data);
  const normalized = resolveRules(membership.role, merged);

  await db.aIConfig.upsert({
    where: { workspaceId: workspace.id },
    create: { workspaceId: workspace.id, reviewRules: normalized },
    update: { reviewRules: normalized },
  });

  // Invalidate everyone's cache so the next open shows the new rules.
  const invalidated = await invalidateWorkspaceCache(workspace.id);

  emit("review_queue.rules_edit", {
    workspaceId: workspace.id,
    actorUserId: membership.userId,
    bucketChangedIds: Object.keys(parsed.data.buckets || {}),
    thresholdChangedKeys: Object.values(parsed.data.buckets || {})
      .flatMap((b) => Object.keys(b?.thresholds || {})),
    aiEnabled: normalized.aiOverlay.enabled,
    scope: normalized.scope,
    cacheRowsInvalidated: invalidated,
  });

  return NextResponse.json({ ok: true, rules: normalized, rulesHash: hashRules(normalized) });
}

function mergeRules(existing: unknown, patch: z.infer<typeof Patch>): unknown {
  const base = (existing && typeof existing === "object" ? (existing as Record<string, unknown>) : {});
  const next: Record<string, unknown> = { ...base };
  if (patch.scope) next.scope = patch.scope;
  if (patch.aiOverlay) {
    next.aiOverlay = { ...((base.aiOverlay as Record<string, unknown>) || {}), ...patch.aiOverlay };
  }
  if (patch.buckets) {
    const existingBuckets = (base.buckets as Record<string, Record<string, unknown>>) || {};
    const nextBuckets: Record<string, Record<string, unknown>> = { ...existingBuckets };
    for (const [id, override] of Object.entries(patch.buckets)) {
      const current = (existingBuckets[id] as Record<string, unknown>) || {};
      const merged: Record<string, unknown> = { ...current };
      if (typeof override.enabled === "boolean") merged.enabled = override.enabled;
      if (typeof override.severity === "number") merged.severity = override.severity;
      if (override.thresholds) {
        merged.thresholds = { ...((current.thresholds as Record<string, unknown>) || {}), ...override.thresholds };
      }
      nextBuckets[id] = merged;
    }
    next.buckets = nextBuckets;
  }
  return next;
}
