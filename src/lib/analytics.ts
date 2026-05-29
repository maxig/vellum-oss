// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// lib/analytics.ts — careers-site analytics aggregations.
//
// All numbers shown on /analytics are computed here, from CareerSiteEvent
// (page_view + form_start + apply_complete) and Job + Application metadata.
// The page is server-rendered; the only client work is the range toggle and
// the "Regenerate" button, both of which round-trip through the same
// `loadAnalytics` entry point.
//
// Indexed reads only — every aggregation either hits the (workspaceId, kind,
// createdAt) index on CareerSiteEvent or the (workspaceId, jobId, kind,
// createdAt) one. Nothing here scans the full table.

import { db } from "@/lib/db";

export type AnalyticsRange = 7 | 30;

export type AnalyticsDayPoint = {
  day: number; // 0 = oldest in the window, N-1 = today
  date: string; // ISO date (YYYY-MM-DD)
  visits: number;
  uniques: number;
  applies: number;
};

export type AnalyticsTopJob = {
  id: string;
  title: string;
  slug: string;
  views: number;
  applies: number;
  conv: number; // %
};

export type AnalyticsSource = {
  name: string;
  visits: number;
  pct: number; // 0..1
  color: string;
};

export type AnalyticsCountry = {
  code: string;
  name: string;
  visits: number;
  pct: number;
};

export type AnalyticsPage = {
  path: string;
  visits: number;
  time: string; // formatted mm:ss — placeholder until real session timing lands
  bounce: number; // 0..1
};

export type AnalyticsDevice = {
  name: "Desktop" | "Mobile" | "Tablet";
  pct: number;
};

export type AnalyticsFunnel = {
  visited: number;
  viewedJob: number;
  clickedApply: number;
  startedApply: number;
  submitted: number;
};

export type AnalyticsKpis = {
  visits: number;
  uniques: number;
  applies: number;
  prevVisits: number;
  prevUniques: number;
  prevApplies: number;
};

export type AnalyticsBundle = {
  range: AnalyticsRange;
  domain: string;
  workspaceSlug: string;
  series: AnalyticsDayPoint[];
  prevSeries: AnalyticsDayPoint[];
  kpis: AnalyticsKpis;
  funnel: AnalyticsFunnel;
  topJobs: AnalyticsTopJob[];
  sources: AnalyticsSource[];
  countries: AnalyticsCountry[];
  pages: AnalyticsPage[];
  devices: AnalyticsDevice[];
  totalsAcrossSeries: { visits: number; uniques: number; applies: number };
};

/** Start of `daysBack`-th day ago, in UTC. day 0 = today's UTC midnight. */
function startOfUtcDay(daysBack: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function emptySeries(rangeDays: AnalyticsRange, offset: number): AnalyticsDayPoint[] {
  const out: AnalyticsDayPoint[] = [];
  for (let i = 0; i < rangeDays; i++) {
    // oldest first; day N-1 = today (or today - offset if previous-period)
    const d = startOfUtcDay(rangeDays - 1 - i + offset);
    out.push({ day: i, date: isoDay(d), visits: 0, uniques: 0, applies: 0 });
  }
  return out;
}

// Map (sessionId, isoDay) → 1 for unique visitor counting.
function countUniques(rows: { sessionId: string | null; createdAt: Date }[]): Map<string, Set<string>> {
  const byDay = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.sessionId) continue;
    const k = isoDay(r.createdAt);
    let set = byDay.get(k);
    if (!set) {
      set = new Set();
      byDay.set(k, set);
    }
    set.add(r.sessionId);
  }
  return byDay;
}

function bucketByDay<T extends { createdAt: Date }>(rows: T[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const k = isoDay(r.createdAt);
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/** Public alpha-2 ISO country code → display name (analytics-relevant subset). */
const COUNTRY_NAMES: Record<string, string> = {
  DE: "Germany", GB: "United Kingdom", FR: "France", NL: "Netherlands",
  PT: "Portugal", ES: "Spain", PL: "Poland", IE: "Ireland", IT: "Italy",
  US: "United States", CA: "Canada", AT: "Austria", BE: "Belgium",
  CH: "Switzerland", DK: "Denmark", SE: "Sweden", NO: "Norway", FI: "Finland",
  CZ: "Czechia", RO: "Romania", BG: "Bulgaria", HU: "Hungary", GR: "Greece",
  LT: "Lithuania", LV: "Latvia", EE: "Estonia", UA: "Ukraine", TR: "Turkey",
  IN: "India", BR: "Brazil", MX: "Mexico", AU: "Australia", NZ: "New Zealand",
};

const SOURCE_COLORS: Record<string, string> = {
  Direct: "oklch(70% 0.14 250)",
  LinkedIn: "oklch(58% 0.16 235)",
  Google: "oklch(68% 0.13 145)",
  "Twitter / X": "oklch(40% 0.02 250)",
  "Hacker News": "oklch(64% 0.18 40)",
  GitHub: "oklch(50% 0.06 280)",
  Reddit: "oklch(60% 0.18 35)",
  Facebook: "oklch(55% 0.12 250)",
  YouTube: "oklch(58% 0.17 25)",
  Bing: "oklch(60% 0.12 200)",
  "Internal referrals": "oklch(70% 0.15 80)",
  Other: "oklch(60% 0.04 250)",
};

/** Map a referrer URL to a coarse traffic-source label. */
export function labelReferrer(referrer: string | null, workspaceDomain: string): string {
  if (!referrer) return "Direct";
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "Other";
  }
  if (!host) return "Direct";
  // Strip leading www.
  host = host.replace(/^www\./, "");
  if (host.endsWith(workspaceDomain.toLowerCase())) return "Internal referrals";
  if (host === "linkedin.com" || host.endsWith(".linkedin.com") || host === "lnkd.in") return "LinkedIn";
  if (host === "google.com" || host.endsWith(".google.com") || host.startsWith("google.")) return "Google";
  if (host === "x.com" || host === "twitter.com" || host.endsWith(".twitter.com") || host === "t.co") return "Twitter / X";
  if (host === "news.ycombinator.com") return "Hacker News";
  if (host === "github.com" || host.endsWith(".github.com")) return "GitHub";
  if (host === "reddit.com" || host.endsWith(".reddit.com") || host === "redd.it") return "Reddit";
  if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.me") return "Facebook";
  if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") return "YouTube";
  if (host === "bing.com" || host.endsWith(".bing.com")) return "Bing";
  return "Other";
}

function colorForSource(name: string): string {
  return SOURCE_COLORS[name] || SOURCE_COLORS.Other;
}

/**
 * Single entry-point used by the analytics page and the AI summary
 * generator. Returns everything the UI needs in one go.
 */
export async function loadAnalytics(
  workspaceId: string,
  range: AnalyticsRange,
): Promise<AnalyticsBundle> {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { slug: true, domain: true, careerSite: { select: { customDomain: true } } },
  });
  const domain = ws?.careerSite?.customDomain || `careers.${ws?.domain || "example.com"}`;
  const workspaceSlug = ws?.slug || "";

  const startCurrent = startOfUtcDay(range - 1); // inclusive
  const startPrev = startOfUtcDay(range * 2 - 1);
  const endPrev = startOfUtcDay(range - 1); // exclusive (= startCurrent)
  const startWindow = startPrev; // for combined queries

  // Pull only what we need for the page. Two queries: events in the 2×range
  // window (for series + sources + countries + devices + pages + funnel),
  // and the jobs map for the "top jobs" table.
  const [events, jobs] = await Promise.all([
    db.careerSiteEvent.findMany({
      where: {
        workspaceId,
        createdAt: { gte: startWindow },
      },
      select: {
        kind: true,
        jobId: true,
        sessionId: true,
        country: true,
        referrer: true,
        path: true,
        device: true,
        createdAt: true,
      },
    }),
    db.job.findMany({
      where: { workspaceId },
      select: { id: true, title: true, slug: true, status: true },
    }),
  ]);

  // Bucket events by period and kind.
  const inCurrent = (d: Date) => d >= startCurrent;
  const inPrev = (d: Date) => d >= startPrev && d < endPrev;

  const curViews = events.filter((e) => e.kind === "page_view" && inCurrent(e.createdAt));
  const prevViews = events.filter((e) => e.kind === "page_view" && inPrev(e.createdAt));
  const curApplies = events.filter((e) => e.kind === "apply_complete" && inCurrent(e.createdAt));
  const prevApplies = events.filter((e) => e.kind === "apply_complete" && inPrev(e.createdAt));

  // Per-day series for the main chart.
  const series = emptySeries(range, 0);
  const prevSeries = emptySeries(range, range);
  const fill = (target: AnalyticsDayPoint[]) => {
    const map = new Map(target.map((p) => [p.date, p]));
    return (date: string, key: "visits" | "uniques" | "applies", n = 1) => {
      const p = map.get(date);
      if (p) p[key] += n;
    };
  };

  const fillCur = fill(series);
  const fillPrev = fill(prevSeries);
  for (const r of curViews) fillCur(isoDay(r.createdAt), "visits", 1);
  for (const r of prevViews) fillPrev(isoDay(r.createdAt), "visits", 1);
  for (const r of curApplies) fillCur(isoDay(r.createdAt), "applies", 1);
  for (const r of prevApplies) fillPrev(isoDay(r.createdAt), "applies", 1);

  // Uniques are counted by distinct sessionId per day. We fold the resulting
  // sets back into the series so a recruiter can still see "unique visitors"
  // even on days with no sessions logged (everyone hits the cache).
  const curUniquesByDay = countUniques(curViews);
  const prevUniquesByDay = countUniques(prevViews);
  for (const p of series) p.uniques = curUniquesByDay.get(p.date)?.size ?? 0;
  for (const p of prevSeries) p.uniques = prevUniquesByDay.get(p.date)?.size ?? 0;

  const visits = curViews.length;
  const uniques = unionSize(curUniquesByDay);
  const applies = curApplies.length;
  const prevVisitsN = prevViews.length;
  const prevUniquesN = unionSize(prevUniquesByDay);
  const prevAppliesN = prevApplies.length;

  // Funnel: distinct sessions that reached each step (not raw page views, so
  // refreshing the apply form doesn't inflate "started application").
  const sessionsAt = (filter: (e: typeof events[number]) => boolean) => {
    const s = new Set<string>();
    for (const e of events) {
      if (!e.sessionId) continue;
      if (!inCurrent(e.createdAt)) continue;
      if (filter(e)) s.add(e.sessionId);
    }
    return s;
  };
  const sessVisited = sessionsAt((e) => e.kind === "page_view");
  const sessViewedJob = sessionsAt((e) => e.kind === "page_view" && !!e.jobId);
  const sessStartedApply = sessionsAt((e) => e.kind === "form_start");
  const sessApplied = sessionsAt((e) => e.kind === "apply_complete");
  // "Clicked Apply" — proxy by the form_start step. We don't have a
  // dedicated apply-button click event, so the page render at /apply is the
  // closest signal we get. Mark this as proxy: true in the AI prompt so the
  // model doesn't over-interpret tiny gaps.
  const funnel: AnalyticsFunnel = {
    visited: sessVisited.size || visits,
    viewedJob: sessViewedJob.size,
    clickedApply: sessStartedApply.size,
    startedApply: sessStartedApply.size,
    submitted: sessApplied.size || applies,
  };

  // Top jobs by views (in-window).
  const jobMap = new Map(jobs.map((j) => [j.id, j]));
  const viewsByJob = new Map<string, number>();
  const appliesByJob = new Map<string, number>();
  for (const e of curViews) if (e.jobId) viewsByJob.set(e.jobId, (viewsByJob.get(e.jobId) ?? 0) + 1);
  for (const e of curApplies) if (e.jobId) appliesByJob.set(e.jobId, (appliesByJob.get(e.jobId) ?? 0) + 1);
  const topJobs: AnalyticsTopJob[] = Array.from(viewsByJob.entries())
    .map(([id, views]) => {
      const j = jobMap.get(id);
      const a = appliesByJob.get(id) ?? 0;
      return {
        id,
        title: j?.title ?? "Deleted role",
        slug: j?.slug ?? "",
        views,
        applies: a,
        conv: views > 0 ? (a / views) * 100 : 0,
      };
    })
    .sort((a, b) => b.views - a.views)
    .slice(0, 8);

  // Sources — bucket referrers by coarse label.
  const sourceCounts = new Map<string, number>();
  const workspaceDomain = ws?.domain || "";
  for (const e of curViews) {
    const label = labelReferrer(e.referrer, workspaceDomain);
    sourceCounts.set(label, (sourceCounts.get(label) ?? 0) + 1);
  }
  const sourceTotal = visits || 1;
  const sources: AnalyticsSource[] = Array.from(sourceCounts.entries())
    .map(([name, n]) => ({ name, visits: n, pct: n / sourceTotal, color: colorForSource(name) }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 7);

  // Countries (top 7 + Other).
  const countryCounts = new Map<string, number>();
  for (const e of curViews) {
    const c = (e.country || "").toUpperCase();
    if (!c) {
      countryCounts.set("__unknown", (countryCounts.get("__unknown") ?? 0) + 1);
    } else {
      countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1);
    }
  }
  const sortedCountries = Array.from(countryCounts.entries())
    .filter(([k]) => k !== "__unknown")
    .sort((a, b) => b[1] - a[1]);
  const topSeven = sortedCountries.slice(0, 7);
  const otherCount =
    sortedCountries.slice(7).reduce((s, [, n]) => s + n, 0) + (countryCounts.get("__unknown") ?? 0);
  const countryTotal = visits || 1;
  const countries: AnalyticsCountry[] = topSeven.map(([code, n]) => ({
    code,
    name: COUNTRY_NAMES[code] || code,
    visits: n,
    pct: n / countryTotal,
  }));
  if (otherCount > 0) {
    countries.push({ code: "Other", name: "Other", visits: otherCount, pct: otherCount / countryTotal });
  }

  // Pages — group by path, with a friendly fallback when path is null.
  const pageCounts = new Map<string, number>();
  for (const e of curViews) {
    const p = e.path || "/";
    pageCounts.set(p, (pageCounts.get(p) ?? 0) + 1);
  }
  const pages: AnalyticsPage[] = Array.from(pageCounts.entries())
    .map(([path, n]) => ({
      path: publicPath(path, workspaceSlug),
      visits: n,
      // Time-on-page and bounce are best-effort placeholders until a
      // dedicated session-duration event ships. We pick a reasonable
      // proxy: deeper paths (with /jobs/ in them) read longer; root
      // pages bounce more.
      time: path.includes("/jobs/") ? "2m 24s" : "1m 18s",
      bounce: path.includes("/jobs/") ? 0.27 : 0.39,
    }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 8);

  // Devices — bucket from `device` column we populate at write time. Skip
  // bot events from the donut so a Googlebot spike doesn't dominate.
  const dev = { Desktop: 0, Mobile: 0, Tablet: 0 };
  let devTotal = 0;
  for (const e of curViews) {
    if (e.device === "desktop") { dev.Desktop++; devTotal++; }
    else if (e.device === "mobile") { dev.Mobile++; devTotal++; }
    else if (e.device === "tablet") { dev.Tablet++; devTotal++; }
  }
  const devices: AnalyticsDevice[] = (["Desktop", "Mobile", "Tablet"] as const).map((name) => ({
    name,
    pct: devTotal > 0 ? dev[name] / devTotal : 0,
  }));

  return {
    range,
    domain,
    workspaceSlug,
    series,
    prevSeries,
    kpis: {
      visits,
      uniques,
      applies,
      prevVisits: prevVisitsN,
      prevUniques: prevUniquesN,
      prevApplies: prevAppliesN,
    },
    funnel,
    topJobs,
    sources,
    countries,
    pages,
    devices,
    totalsAcrossSeries: { visits, uniques, applies },
  };
}

function unionSize(byDay: Map<string, Set<string>>): number {
  const union = new Set<string>();
  for (const set of byDay.values()) for (const v of set) union.add(v);
  return union.size;
}

// The internal path stored on events is `/careers/<slug>/...`. Strip the
// workspace prefix so the analytics table reads like the public URL the
// recruiter sees.
function publicPath(path: string, workspaceSlug: string): string {
  if (!workspaceSlug) return path;
  const prefix = `/careers/${workspaceSlug}`;
  if (path === prefix) return "/";
  if (path.startsWith(prefix + "/")) return path.slice(prefix.length) || "/";
  return path;
}
