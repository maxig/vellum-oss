// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// lib/analytics-summary.ts — AI-generated weekly summary for /analytics.
//
// Cached per (workspaceId, range). Regenerated at most once an hour: every
// recruiter who opens the page within that window reads the same
// pre-computed insights. The cache key also hashes the underlying metrics
// so a big traffic move (e.g. a Hacker News spike) invalidates eagerly
// instead of waiting for the hourly window to roll over.

import crypto from "node:crypto";
import { db } from "@/lib/db";
import { complete, isAIEnabled } from "@/lib/ai";
import type { AnalyticsBundle, AnalyticsRange } from "@/lib/analytics";

export type InsightTone = "good" | "risk" | "neutral";

export type AnalyticsInsight = {
  tone: InsightTone;
  body: string;
};

export type AnalyticsSummary = {
  insights: AnalyticsInsight[];
  generatedAt: Date;
  expiresAt: Date;
  mocked: boolean;
  fromCache: boolean;
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_INSIGHTS = 4;

/**
 * Load (or generate) the AI summary for a workspace + range. Cheap on the
 * cache-hit path: a single primary-key lookup. On miss it runs one LLM call
 * and writes back the row.
 */
export async function getOrBuildSummary(
  workspaceId: string,
  range: AnalyticsRange,
  bundle: AnalyticsBundle,
  opts: { force?: boolean } = {},
): Promise<AnalyticsSummary> {
  const metricsHash = hashMetrics(bundle);
  const now = new Date();

  if (!opts.force) {
    const cached = await db.analyticsSummaryCache.findUnique({
      where: { workspaceId_rangeDays: { workspaceId, rangeDays: range } },
    });
    if (
      cached &&
      cached.metricsHash === metricsHash &&
      cached.expiresAt > now &&
      Array.isArray(cached.insights)
    ) {
      return {
        insights: (cached.insights as unknown as AnalyticsInsight[]).slice(0, MAX_INSIGHTS),
        generatedAt: cached.generatedAt,
        expiresAt: cached.expiresAt,
        mocked: cached.mocked,
        fromCache: true,
      };
    }
  }

  const built = await buildSummary(workspaceId, range, bundle);
  const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);
  await db.analyticsSummaryCache
    .upsert({
      where: { workspaceId_rangeDays: { workspaceId, rangeDays: range } },
      create: {
        workspaceId,
        rangeDays: range,
        metricsHash,
        insights: built.insights as unknown as object,
        generatedAt: now,
        expiresAt,
        mocked: built.mocked,
      },
      update: {
        metricsHash,
        insights: built.insights as unknown as object,
        generatedAt: now,
        expiresAt,
        mocked: built.mocked,
      },
    })
    .catch((e) => {
      console.warn("[analytics-summary] cache write failed:", (e as Error).message);
    });

  return {
    insights: built.insights,
    generatedAt: now,
    expiresAt,
    mocked: built.mocked,
    fromCache: false,
  };
}

/** Stable hash of the numbers that go into the prompt. */
function hashMetrics(b: AnalyticsBundle): string {
  const payload = {
    range: b.range,
    visits: b.kpis.visits,
    uniques: b.kpis.uniques,
    applies: b.kpis.applies,
    prevVisits: b.kpis.prevVisits,
    prevUniques: b.kpis.prevUniques,
    prevApplies: b.kpis.prevApplies,
    funnel: b.funnel,
    topJobs: b.topJobs.map((j) => ({ t: j.title, v: j.views, a: j.applies, c: Math.round(j.conv * 100) })),
    sources: b.sources.map((s) => ({ n: s.name, v: s.visits })),
    countries: b.countries.map((c) => ({ c: c.code, v: c.visits })),
    devices: b.devices.map((d) => ({ n: d.name, p: Math.round(d.pct * 100) })),
  };
  return crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}

async function buildSummary(
  workspaceId: string,
  range: AnalyticsRange,
  b: AnalyticsBundle,
): Promise<{ insights: AnalyticsInsight[]; mocked: boolean }> {
  const enabled = await isAIEnabled(workspaceId);

  // Always have a deterministic fallback ready. Even when the LLM is on, we
  // use this if parsing fails — better to show something useful than a
  // spinner that never finishes.
  const fallback = deterministicInsights(b);

  if (!enabled) {
    return { insights: fallback, mocked: true };
  }

  const system = [
    "You are Vellum AI's careers-analytics analyst.",
    "Given a recruiter's site stats, return at most 4 insights as a strict JSON array.",
    "Each insight is { tone: \"good\" | \"risk\" | \"neutral\", body: string }.",
    "- tone=good for wins (traffic up, strong conversion).",
    "- tone=risk for problems (drop-offs, channels with low conversion, mobile UX gaps).",
    "- tone=neutral for observations worth noting.",
    "Reference the numbers in plain English; use bold (**...**) for a single key figure per bullet.",
    "Each body fits in one sentence (under 220 chars). No emoji. No prose outside the JSON.",
    "If the numbers are too small to draw any conclusion (under 50 visits in the window), return an empty array.",
  ].join("\n");

  const user = buildPromptUser(range, b);

  const r = await complete(workspaceId, system, user, { maxTokens: 600, temperature: 0.4 });
  if (r.mocked) return { insights: fallback, mocked: true };

  const parsed = parseInsights(r.text);
  if (!parsed) {
    // Provider replied but we couldn't parse it — show the deterministic
    // fallback rather than nothing, and treat it as "real" (the LLM still
    // ran; this just hardens against schema drift).
    return { insights: fallback, mocked: false };
  }
  return { insights: parsed.slice(0, MAX_INSIGHTS), mocked: false };
}

function buildPromptUser(range: AnalyticsRange, b: AnalyticsBundle): string {
  const { kpis: k, funnel: f } = b;
  const deltaPct = (cur: number, prev: number) =>
    prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
  const lines: string[] = [];
  lines.push(`Window: last ${range} days vs previous ${range} days`);
  lines.push("");
  lines.push("KPIs");
  lines.push(`- Page views: ${k.visits} (prev ${k.prevVisits}, ${fmtDelta(deltaPct(k.visits, k.prevVisits))})`);
  lines.push(`- Unique visitors: ${k.uniques} (prev ${k.prevUniques}, ${fmtDelta(deltaPct(k.uniques, k.prevUniques))})`);
  lines.push(`- Applications: ${k.applies} (prev ${k.prevApplies}, ${fmtDelta(deltaPct(k.applies, k.prevApplies))})`);
  const conv = k.visits > 0 ? (k.applies / k.visits) * 100 : 0;
  const prevConv = k.prevVisits > 0 ? (k.prevApplies / k.prevVisits) * 100 : 0;
  lines.push(`- Conversion rate: ${conv.toFixed(2)}% (prev ${prevConv.toFixed(2)}%)`);
  lines.push("");
  lines.push("Funnel (distinct sessions per step)");
  lines.push(`- Visited site: ${f.visited}`);
  lines.push(`- Viewed a job: ${f.viewedJob}`);
  lines.push(`- Started application: ${f.startedApply}`);
  lines.push(`- Submitted application: ${f.submitted}`);
  if (b.topJobs.length) {
    lines.push("");
    lines.push("Top jobs by views");
    for (const j of b.topJobs.slice(0, 5)) {
      lines.push(`- ${j.title}: ${j.views} views, ${j.applies} applies, ${j.conv.toFixed(2)}% conv`);
    }
  }
  if (b.sources.length) {
    lines.push("");
    lines.push("Top sources");
    for (const s of b.sources.slice(0, 5)) {
      lines.push(`- ${s.name}: ${s.visits} visits (${Math.round(s.pct * 100)}%)`);
    }
  }
  if (b.countries.length) {
    lines.push("");
    lines.push("Top countries");
    for (const c of b.countries.slice(0, 5)) {
      lines.push(`- ${c.name}: ${c.visits} visits (${Math.round(c.pct * 100)}%)`);
    }
  }
  if (b.devices.length) {
    lines.push("");
    lines.push("Devices");
    for (const d of b.devices) {
      lines.push(`- ${d.name}: ${Math.round(d.pct * 100)}%`);
    }
  }
  lines.push("");
  lines.push("Return at most 4 insights. Output a strict JSON array only — no fences, no prose.");
  return lines.join("\n");
}

function fmtDelta(d: number | null): string {
  if (d === null) return "no prior baseline";
  if (d === 0) return "flat";
  return `${d > 0 ? "+" : ""}${d}%`;
}

function parseInsights(text: string): AnalyticsInsight[] | null {
  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!cleaned.startsWith("[")) {
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (m) cleaned = m[0];
  }
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  const out: AnalyticsInsight[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const tone = it.tone;
    const body = typeof it.body === "string" ? it.body.trim() : "";
    if (!body) continue;
    const t: InsightTone =
      tone === "good" || tone === "risk" || tone === "neutral" ? tone : "neutral";
    out.push({ tone: t, body: body.slice(0, 360) });
  }
  return out;
}

/**
 * Deterministic, rule-driven insights. Used when AI is off, when the
 * provider mocks, when parsing fails, and when the window is too small to
 * say anything useful. Always at least one bullet, so the panel never
 * renders empty.
 */
function deterministicInsights(b: AnalyticsBundle): AnalyticsInsight[] {
  const out: AnalyticsInsight[] = [];
  const { kpis: k } = b;

  const visitsDelta =
    k.prevVisits > 0 ? Math.round(((k.visits - k.prevVisits) / k.prevVisits) * 100) : null;
  if (visitsDelta !== null && Math.abs(visitsDelta) >= 5) {
    out.push({
      tone: visitsDelta >= 0 ? "good" : "risk",
      body:
        visitsDelta >= 0
          ? `Traffic is up **${visitsDelta}%** vs last period — keep an eye on which sources drove the jump.`
          : `Traffic is down **${Math.abs(visitsDelta)}%** vs last period — worth checking your top sources for changes.`,
    });
  }

  // Best-converting job that doesn't have much traffic.
  const promotable = [...b.topJobs]
    .filter((j) => j.views >= 30 && j.conv > 0)
    .sort((a, b2) => b2.conv - a.conv)[0];
  const busiest = [...b.topJobs].sort((a, b2) => b2.views - a.views)[0];
  if (promotable && busiest && promotable.id !== busiest.id && promotable.conv > 3) {
    out.push({
      tone: "neutral",
      body: `**${promotable.title}** has the best conversion (${promotable.conv.toFixed(
        2,
      )}%) but lower traffic than ${busiest.title} — worth promoting on LinkedIn.`,
    });
  }

  // Mobile share — flag if mobile is the majority and pages still feel
  // desktop-first. We treat >40% mobile as worth a callout.
  const mobile = b.devices.find((d) => d.name === "Mobile");
  if (mobile && mobile.pct > 0.4) {
    out.push({
      tone: "risk",
      body: `Mobile share is **${Math.round(
        mobile.pct * 100,
      )}%** this period. Make sure your job listing pages don't feel desktop-first.`,
    });
  }

  // Strong single source — call it out for redistribution risk.
  const heavy = b.sources.find((s) => s.pct >= 0.5);
  if (heavy && heavy.name !== "Direct") {
    out.push({
      tone: "neutral",
      body: `**${heavy.name}** is driving ${Math.round(
        heavy.pct * 100,
      )}% of your visits — diversify before it dries up.`,
    });
  }

  // Funnel drop-off between "started" and "submitted".
  if (b.funnel.startedApply >= 20) {
    const finish = b.funnel.submitted / b.funnel.startedApply;
    if (finish < 0.6) {
      out.push({
        tone: "risk",
        body: `Only **${Math.round(
          finish * 100,
        )}%** of started applications make it to submit. The form is leaking — shorten it or remove blockers.`,
      });
    }
  }

  if (out.length === 0) {
    out.push({
      tone: "neutral",
      body:
        k.visits > 0
          ? `Steady period: **${k.visits.toLocaleString()}** views and **${k.applies}** applications. Nothing unusual to flag.`
          : "Not enough traffic in this window to draw conclusions — give it a few more days.",
    });
  }

  return out.slice(0, MAX_INSIGHTS);
}
