// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// /api/analytics/export — CSV download of the per-day series for the
// current window. Used by the "Export" button on the analytics page.

import { requireWorkspace } from "@/lib/workspace";
import { loadAnalytics, type AnalyticsRange } from "@/lib/analytics";

function parseRange(v: string | null): AnalyticsRange {
  return v === "7" ? 7 : 30;
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request) {
  const { workspace } = await requireWorkspace();
  const url = new URL(req.url);
  const range = parseRange(url.searchParams.get("range"));
  const data = await loadAnalytics(workspace.id, range);

  const rows: string[] = [];
  rows.push("date,visits,uniques,applies");
  for (const d of data.series) {
    rows.push([d.date, d.visits, d.uniques, d.applies].map((v) => csvEscape(String(v))).join(","));
  }
  rows.push("");
  rows.push("# Top jobs");
  rows.push("job_title,job_slug,views,applies,conversion_pct");
  for (const j of data.topJobs) {
    rows.push(
      [j.title, j.slug, j.views, j.applies, j.conv.toFixed(2)].map((v) => csvEscape(String(v))).join(","),
    );
  }
  rows.push("");
  rows.push("# Sources");
  rows.push("source,visits,pct");
  for (const s of data.sources) {
    rows.push([s.name, s.visits, (s.pct * 100).toFixed(1)].map((v) => csvEscape(String(v))).join(","));
  }
  rows.push("");
  rows.push("# Countries");
  rows.push("country_code,country_name,visits,pct");
  for (const c of data.countries) {
    rows.push([c.code, c.name, c.visits, (c.pct * 100).toFixed(1)].map((v) => csvEscape(String(v))).join(","));
  }

  const filename = `vellum-analytics-${range}d-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
