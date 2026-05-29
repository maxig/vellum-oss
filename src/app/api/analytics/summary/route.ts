// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// /api/analytics/summary — get or rebuild the AI insight bullets for the
// careers analytics page.
//
//   GET  ?range=7|30           → return cached (or build if cold)
//   POST ?range=7|30&force=1   → force a rebuild now (Regenerate button)

import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { loadAnalytics, type AnalyticsRange } from "@/lib/analytics";
import { getOrBuildSummary } from "@/lib/analytics-summary";

function parseRange(v: string | null): AnalyticsRange {
  return v === "7" ? 7 : 30;
}

export async function GET(req: Request) {
  const { workspace } = await requireWorkspace();
  const url = new URL(req.url);
  const range = parseRange(url.searchParams.get("range"));
  const data = await loadAnalytics(workspace.id, range);
  const summary = await getOrBuildSummary(workspace.id, range, data);
  return NextResponse.json(summary);
}

export async function POST(req: Request) {
  const { workspace } = await requireWorkspace();
  const url = new URL(req.url);
  const range = parseRange(url.searchParams.get("range"));
  const force = url.searchParams.get("force") === "1";
  const data = await loadAnalytics(workspace.id, range);
  const summary = await getOrBuildSummary(workspace.id, range, data, { force });
  return NextResponse.json(summary);
}
