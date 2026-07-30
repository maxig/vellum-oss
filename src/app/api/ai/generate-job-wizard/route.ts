// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { aiRateLimit } from "@/lib/rate-limit";
import { generateJobWizard } from "@/lib/ai";

const Body = z.object({
  title: z.string().trim().min(1),
  prompt: z.string().trim().default(""),
  tone: z.string().trim().default("Warm"),
});

export async function POST(req: Request) {
  const { workspace, user } = await requireWorkspace();
  const rl = aiRateLimit(workspace.id, user.id);
  if (!rl.ok) return NextResponse.json({ error: "Too many AI requests." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { title, prompt, tone } = parsed.data;

  try {
    const result = await generateJobWizard(workspace.id, { title, prompt, tone });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "AI generation failed" }, { status: 500 });
  }
}
