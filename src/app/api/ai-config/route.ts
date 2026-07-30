// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace, isAdmin } from "@/lib/workspace";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { assertPublicUrl, SsrfError } from "@/lib/ssrf";

// `recapSettings` is intentionally permissive — the nested shape is
// documented in schema.prisma and validated at consumption time. We just
// gatekeep the top-level keys here so callers can't write arbitrary
// columns into the blob.
const RecapSettings = z
  .object({
    tone: z.enum(["factual", "conversational", "quirky"]).optional(),
    timing: z
      .object({
        dailyHour: z.number().int().min(0).max(23).optional(),
        weeklyDay: z.number().int().min(1).max(7).optional(),
        monthlyDay: z.number().int().min(1).max(28).optional(),
      })
      .optional(),
    thresholds: z
      .object({
        staleStageMultiplier: z.number().min(0.5).max(10).optional(),
        awaitingReplyHours: z.number().int().min(1).max(720).optional(),
        retentionWarningDays: z.number().int().min(1).max(365).optional(),
      })
      .optional(),
    recipients: z.array(z.string()).optional(),
  })
  .strict();

const Patch = z.object({
  provider: z.enum(["anthropic", "openai", "google", "ollama"]).optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().or(z.literal("")).nullable().optional(),
  features: z.record(z.string(), z.boolean()).optional(),
  redactPII: z.boolean().optional(),
  noLog: z.boolean().optional(),
  cacheEnabled: z.boolean().optional(),
  recapSettings: RecapSettings.optional(),
});

export async function PATCH(req: Request) {
  const { workspace, membership } = await requireWorkspace();
  if (!isAdmin(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const d = parsed.data;

  // SSRF guard: a custom AI base URL is fetched server-side (OpenAI-compatible
  // endpoints, self-hosted Ollama, etc). Block private/reserved targets — but
  // note the dev default allows localhost so a local Ollama still works.
  if (d.baseUrl) {
    try {
      await assertPublicUrl(d.baseUrl);
    } catch (e) {
      const msg = e instanceof SsrfError ? e.message : "Invalid base URL";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  const data: any = {};
  if (d.provider) data.provider = d.provider;
  if (d.model) data.model = d.model;
  if (typeof d.apiKey === "string" && d.apiKey.length > 0) data.apiKeyEncrypted = encryptSecret(d.apiKey);
  if (d.baseUrl !== undefined) data.baseUrl = d.baseUrl ? d.baseUrl.replace(/\/$/, "") : null;
  if (d.features) data.features = d.features;
  if (typeof d.redactPII === "boolean") data.redactPII = d.redactPII;
  if (typeof d.noLog === "boolean") data.noLog = d.noLog;
  if (typeof d.cacheEnabled === "boolean") data.cacheEnabled = d.cacheEnabled;
  if (d.recapSettings) {
    // Merge over the existing settings so a partial PATCH doesn't blow
    // away unrelated keys (e.g. saving thresholds shouldn't reset tone).
    const existing = await db.aIConfig.findUnique({
      where: { workspaceId: workspace.id },
      select: { recapSettings: true },
    });
    const merged = { ...((existing?.recapSettings as Record<string, unknown>) || {}), ...d.recapSettings };
    data.recapSettings = merged;
  }

  await db.aIConfig.upsert({
    where: { workspaceId: workspace.id },
    create: { workspaceId: workspace.id, ...data },
    update: data,
  });
  return NextResponse.json({ ok: true });
}
