// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// /api/recap — build (or rebuild) the recap for the current workspace.
// GET ?scope=today|week|month&force=1
//
// The dashboard renders the recap as a server component, so this endpoint
// is for client-side refresh and future Slack/email digest pipelines.

import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { buildRecap, type RecapScope } from "@/lib/recap";

export async function GET(req: Request) {
  const { workspace } = await requireWorkspace();
  const url = new URL(req.url);
  const scopeRaw = url.searchParams.get("scope") || "today";
  const scope: RecapScope =
    scopeRaw === "week" ? "week" : scopeRaw === "month" ? "month" : "today";
  const force = url.searchParams.get("force") === "1";

  const result = await buildRecap(workspace.id, scope, { force });
  return NextResponse.json(result);
}
