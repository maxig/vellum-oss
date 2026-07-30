// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Generic free-form AI completion. Use this when there isn't a more specific
 * /api/ai/* helper that fits the task — e.g. the "Suggest agenda" button on
 * the Schedule modal, future inline AI helpers, future @-Vellum interactions.
 *
 * The workspace's configured provider (Anthropic / Ollama / etc) is used; if
 * no key is set the helper falls back to a mocked response so the UI stays
 * alive in dev.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { aiRateLimit } from "@/lib/rate-limit";
import { complete } from "@/lib/ai";

const Body = z.object({
  prompt: z.string().trim().min(1),
  // Optional system message — defaults to a generic recruiting-assistant
  // persona that fits 90% of inline copy generation use cases.
  system: z.string().trim().optional(),
  maxTokens: z.number().int().min(16).max(2000).optional(),
});

const DEFAULT_SYSTEM =
  "You are Vellum, a warm, sharp recruiting copilot. Answer with concise, professional copy that a recruiter could paste into the product without editing. Prefer plain text or simple markdown; no preamble.";

export async function POST(req: Request) {
  const { workspace, user } = await requireWorkspace();
  const rl = aiRateLimit(workspace.id, user.id);
  if (!rl.ok) return NextResponse.json({ error: "Too many AI requests." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "complete expects { prompt: string, system?: string, maxTokens?: number }.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }
  const { prompt, system, maxTokens } = parsed.data;
  const r = await complete(workspace.id, system || DEFAULT_SYSTEM, prompt, { maxTokens });
  return NextResponse.json({ text: r.text, mocked: r.mocked, provider: r.provider });
}
