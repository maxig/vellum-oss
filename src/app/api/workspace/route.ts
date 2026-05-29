// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { normalizeCookieConfig } from "@/lib/cookies";

const CookieScriptPatch = z.object({
  id: z.string().min(1).max(64),
  category: z.enum(["necessary", "functional", "marketing"]),
  name: z.string().min(1).max(120),
  provider: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
  src: z.string().url().max(500).optional(),
  // Inline JS is intentionally capped; recruiters who need a big snippet
  // can host it externally and paste a `src`.
  code: z.string().max(8000).optional(),
  enabled: z.boolean().optional(),
});

const Patch = z.object({
  name: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  color: z.string().optional(),
  industry: z.string().optional().nullable(),
  size: z.string().optional().nullable(),
  currency: z.string().min(3).max(8).optional(),
  departments: z.array(z.string().trim().min(1).max(40)).optional(),
  timezone: z.string().min(1).max(64).optional(),
  signature: z.string().max(2000).optional().nullable(),
  defaults: z
    .object({
      autoSendConfirmations: z.boolean().optional(),
      aiRejectionDrafts: z.boolean().optional(),
      showSalaryPublicly: z.boolean().optional(),
      // Calendar tab: when off, scheduling an interview skips the email +
      // .ics invite even if SMTP is configured (saves the interview as a
      // draft on the candidate timeline).
      sendInterviewInvites: z.boolean().optional(),
    })
    .partial()
    .optional(),
  cookieConfig: z
    .object({
      enabled: z.boolean().optional(),
      banner: z
        .object({
          title: z.string().max(120).optional(),
          message: z.string().max(500).optional(),
        })
        .partial()
        .optional(),
      scripts: z.array(CookieScriptPatch).max(40).optional(),
    })
    .partial()
    .optional(),
});

export async function PATCH(req: Request) {
  const { workspace, membership } = await requireWorkspace();
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const data: any = { ...parsed.data };
  if (parsed.data.departments) {
    // De-dupe (case-insensitive) and preserve insertion order.
    const seen = new Set<string>();
    data.departments = parsed.data.departments.filter((d) => {
      const k = d.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  // Merge the `defaults` object instead of replacing it — callers may patch
  // a single flag (e.g. Calendar tab toggling `sendInterviewInvites`) and we
  // don't want to wipe out the other toggles managed from the Workspace tab.
  if (parsed.data.defaults) {
    const existing = (workspace as any).defaults as Record<string, boolean> | null;
    data.defaults = { ...(existing && typeof existing === "object" ? existing : {}), ...parsed.data.defaults };
  }
  // Cookie config is patched whole-object — the settings UI sends the full
  // scripts array so adds/edits/deletes flow naturally. We normalize on the
  // way in to drop unknown fields and clamp categories.
  if (parsed.data.cookieConfig) {
    const existing = normalizeCookieConfig((workspace as any).cookieConfig);
    const incoming = parsed.data.cookieConfig;
    data.cookieConfig = normalizeCookieConfig({
      enabled: incoming.enabled ?? existing.enabled,
      banner: { ...existing.banner, ...incoming.banner },
      scripts: incoming.scripts ?? existing.scripts,
    });
  }
  await db.workspace.update({ where: { id: workspace.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const { workspace, membership } = await requireWorkspace();
  if (membership.role !== "owner") {
    return NextResponse.json({ error: "only the owner can delete" }, { status: 403 });
  }
  await db.workspace.delete({ where: { id: workspace.id } });
  return NextResponse.json({ ok: true });
}
