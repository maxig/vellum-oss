// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { complete } from "@/lib/ai";

export async function GET() {
  const { workspace } = await requireWorkspace();
  const r = await complete(workspace.id, "You are a test.", "Reply with the single word: OK.", { maxTokens: 10 });
  if (r.mocked) {
    return NextResponse.json({ ok: false, mocked: true, text: r.text }, { status: 503 });
  }
  return NextResponse.json({ ok: true, mocked: false, provider: r.provider, text: r.text });
}
