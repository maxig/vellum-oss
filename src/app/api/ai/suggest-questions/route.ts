// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { aiRateLimit } from "@/lib/rate-limit";
import { suggestScreeningQuestions } from "@/lib/ai";

const Body = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().default(""),
  requirements: z.array(z.string()).default([]),
  niceToHave: z.array(z.string()).default([]),
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

  const { title, description, requirements, niceToHave } = parsed.data;

  try {
    const result = await suggestScreeningQuestions(workspace.id, {
      title,
      description,
      requirements,
      niceToHave,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "AI generation failed" }, { status: 500 });
  }
}
