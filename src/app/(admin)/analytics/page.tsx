// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import { requireWorkspace } from "@/lib/workspace";
import { loadAnalytics, type AnalyticsRange } from "@/lib/analytics";
import { getOrBuildSummary } from "@/lib/analytics-summary";
import AnalyticsView from "./AnalyticsView";

export const dynamic = "force-dynamic";

function parseRange(v: string | string[] | undefined): AnalyticsRange {
  const n = Array.isArray(v) ? v[0] : v;
  return n === "7" ? 7 : 30;
}

function parseComparing(v: string | string[] | undefined): boolean {
  const s = Array.isArray(v) ? v[0] : v;
  if (s === "0" || s === "false") return false;
  return true;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; compare?: string }>;
}) {
  const { workspace } = await requireWorkspace();
  const sp = await searchParams;
  const range = parseRange(sp.range);
  const comparing = parseComparing(sp.compare);

  const data = await loadAnalytics(workspace.id, range);
  const summary = await getOrBuildSummary(workspace.id, range, data);

  return (
    <AnalyticsView
      data={data}
      comparing={comparing}
      insights={summary.insights}
      summaryGeneratedAt={summary.generatedAt.toISOString()}
      summaryMocked={summary.mocked}
    />
  );
}
