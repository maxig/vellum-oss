// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// lib/recap-monthly.ts — board-style monthly report builder.
//
// Implements RECAP_FEATURE.md §9.4. Eight sections:
//   1. Headline (AI paragraph)
//   2. Numbers (applications, hires, offers, time-to-hire, pipeline health)
//   3. Pipeline health (per-stage funnel + conversion deltas)
//   4. Sources (volume + avg AI-fit per source)
//   5. Roles (per-role mini-cards)
//   6. What changed (AI narrative vs prior month)
//   7. Risks & housekeeping (stalled, stale, compliance horizon)
//   8. Team (top recruiters, review load distribution)
//
// Reuses buildRecap() for §7 (it already aggregates the risk items) and
// pulls the rest from Prisma directly. Outputs a structured object that
// the email renderer and the print/PDF route both consume.

import { db } from "@/lib/db";
import { complete, isAIEnabled } from "@/lib/ai";
import { buildRecap, type RecapItem } from "@/lib/recap";

const DAY = 86_400_000;

export type MonthlyReport = {
  workspaceId: string;
  workspaceName: string;
  bucket: string;                    // YYYY-MM
  generatedAt: Date;
  scopeStart: Date;
  scopeEnd: Date;
  headline: string;                  // AI-generated paragraph; fallback when AI off
  numbers: {
    applications: number;
    hires: number;
    offers: number;
    timeToHireDays: number | null;
    openRoles: number;
    activeCandidates: number;
    pipelineHealthScore: number;     // 0..100 — combines speed, quality, hygiene
  };
  pipelineHealth: { stageKey: string; stageName: string; count: number; deltaVsPrior: number | null }[];
  sources: { source: string; count: number; avgFit: number | null }[];
  roles: { jobId: string; title: string; views: number; apps: number; hires: number; daysOpen: number }[];
  whatChanged: string;               // AI narrative vs prior month; fallback when AI off
  risks: RecapItem[];                // subset of recap items marked warn/celebrate
  team: { topRecruiters: { userId: string; name: string; activity: number }[]; reviewLoad: { userId: string; name: string; assigned: number }[] };
  hasAI: boolean;
};

export async function buildMonthlyReport(workspaceId: string): Promise<MonthlyReport | null> {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true, timezone: true },
  });
  if (!ws) return null;

  const now = new Date();
  const scopeStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const scopeEnd = now;
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevEnd = scopeStart;
  const bucket = `${scopeStart.getFullYear()}-${String(scopeStart.getMonth() + 1).padStart(2, "0")}`;

  const wid = workspaceId;

  // ── 2. Numbers + 3. Pipeline + 4. Sources + 5. Roles + 8. Team ─────
  const [
    apps,
    appsPrev,
    hires,
    hiredForTtH,
    offers,
    openRoles,
    activeCandidates,
    funnelRows,
    funnelRowsPrev,
    stageDefs,
    sourceGroups,
    sourceQualityRaw,
    jobsOpen,
    careerEventsByJob,
    topRecruiters,
    reviewLoad,
  ] = await Promise.all([
    db.application.count({ where: { workspaceId: wid, appliedAt: { gte: scopeStart, lte: scopeEnd } } }),
    db.application.count({ where: { workspaceId: wid, appliedAt: { gte: prevStart, lt: prevEnd } } }),
    db.application.count({
      where: { workspaceId: wid, stage: { key: "hired" }, updatedAt: { gte: scopeStart, lte: scopeEnd } },
    }),
    db.application.findMany({
      where: { workspaceId: wid, stage: { key: "hired" }, updatedAt: { gte: scopeStart, lte: scopeEnd } },
      select: { appliedAt: true, updatedAt: true },
    }),
    db.application.count({
      where: { workspaceId: wid, stage: { key: "offer" }, updatedAt: { gte: scopeStart, lte: scopeEnd } },
    }),
    db.job.count({ where: { workspaceId: wid, status: "Open" } }),
    db.application.count({ where: { workspaceId: wid, archived: false } }),
    db.application.groupBy({
      by: ["stageId"],
      where: { workspaceId: wid, archived: false },
      _count: { _all: true },
    }),
    db.application.groupBy({
      by: ["stageId"],
      where: { workspaceId: wid, archived: false, updatedAt: { lt: prevEnd } },
      _count: { _all: true },
    }),
    db.stage.findMany({ where: { workspaceId: wid }, orderBy: { position: "asc" } }),
    db.candidate.groupBy({
      by: ["source"],
      where: { workspaceId: wid, createdAt: { gte: scopeStart, lte: scopeEnd } },
      _count: { _all: true },
    }),
    db.application.findMany({
      where: { workspaceId: wid, appliedAt: { gte: scopeStart, lte: scopeEnd }, aiFit: { not: null } },
      include: { candidate: { select: { source: true } } },
    }),
    db.job.findMany({
      where: { workspaceId: wid, status: "Open" },
      include: {
        applications: {
          where: { appliedAt: { gte: scopeStart, lte: scopeEnd } },
          include: { stage: true },
        },
      },
      take: 12,
    }),
    db.careerSiteEvent
      .groupBy({
        by: ["jobId"],
        where: { workspaceId: wid, kind: "page_view", jobId: { not: null }, createdAt: { gte: scopeStart, lte: scopeEnd } },
        _count: { _all: true },
      })
      .catch(() => []),
    db.activity.groupBy({
      by: ["actorId"],
      where: {
        workspaceId: wid,
        createdAt: { gte: scopeStart, lte: scopeEnd },
        actorId: { not: null },
        kind: { in: ["moved", "noted", "scheduled", "published"] },
      },
      _count: { _all: true },
      orderBy: { _count: { actorId: "desc" } },
      take: 5,
    }),
    db.application.groupBy({
      by: ["reviewerId"],
      where: { workspaceId: wid, archived: false, reviewerId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { reviewerId: "desc" } },
      take: 5,
    }),
  ]);

  // Time to hire — mean days.
  const timeToHireDays = hiredForTtH.length
    ? Math.round(
        hiredForTtH.reduce(
          (sum, a) => sum + (a.updatedAt.getTime() - a.appliedAt.getTime()) / DAY,
          0,
        ) / hiredForTtH.length,
      )
    : null;

  // Pipeline health by stage with deltas.
  const stageMap = new Map(stageDefs.map((s) => [s.id, s]));
  const prevByStage = new Map(funnelRowsPrev.map((r) => [r.stageId, r._count._all]));
  const pipelineHealth = funnelRows
    .map((r) => {
      const stage = r.stageId ? stageMap.get(r.stageId) : null;
      if (!stage) return null;
      const prev = prevByStage.get(r.stageId) ?? null;
      const deltaVsPrior = prev != null ? r._count._all - prev : null;
      return { stageKey: stage.key, stageName: stage.name, count: r._count._all, deltaVsPrior };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => {
      const ap = stageDefs.find((s) => s.key === a.stageKey)?.position ?? 0;
      const bp = stageDefs.find((s) => s.key === b.stageKey)?.position ?? 0;
      return ap - bp;
    });

  // Sources — combine candidate counts with avg AI fit per source.
  const fitBySource = new Map<string, { sum: number; n: number }>();
  for (const a of sourceQualityRaw) {
    if (a.aiFit == null) continue;
    const src = a.candidate.source || "Other";
    const cur = fitBySource.get(src) || { sum: 0, n: 0 };
    cur.sum += a.aiFit;
    cur.n += 1;
    fitBySource.set(src, cur);
  }
  const sources = sourceGroups
    .filter((s) => s.source)
    .map((s) => {
      const fit = fitBySource.get(s.source!);
      return {
        source: s.source!,
        count: s._count._all,
        avgFit: fit && fit.n > 0 ? Math.round(fit.sum / fit.n) : null,
      };
    })
    .sort((a, b) => b.count - a.count);

  // Per-role mini-cards.
  const viewsByJob = new Map(careerEventsByJob.map((r) => [r.jobId!, r._count._all]));
  const roles = jobsOpen.map((j) => {
    const hiresInScope = j.applications.filter((a) => a.stage?.key === "hired").length;
    const daysOpen = j.publishedAt
      ? Math.max(0, Math.round((Date.now() - j.publishedAt.getTime()) / DAY))
      : Math.max(0, Math.round((Date.now() - j.createdAt.getTime()) / DAY));
    return {
      jobId: j.id,
      title: j.title,
      views: viewsByJob.get(j.id) || 0,
      apps: j.applications.length,
      hires: hiresInScope,
      daysOpen,
    };
  });

  // Team — resolve user names.
  const topRecruiterUsers = await db.user.findMany({
    where: { id: { in: topRecruiters.map((r) => r.actorId).filter(Boolean) as string[] } },
    select: { id: true, name: true, email: true },
  });
  const reviewLoadUsers = await db.user.findMany({
    where: { id: { in: reviewLoad.map((r) => r.reviewerId).filter(Boolean) as string[] } },
    select: { id: true, name: true, email: true },
  });
  const userName = (id: string, list: typeof topRecruiterUsers) =>
    list.find((u) => u.id === id)?.name || list.find((u) => u.id === id)?.email || id;
  const team = {
    topRecruiters: topRecruiters
      .filter((r) => r.actorId)
      .map((r) => ({
        userId: r.actorId!,
        name: userName(r.actorId!, topRecruiterUsers),
        activity: r._count._all,
      })),
    reviewLoad: reviewLoad
      .filter((r) => r.reviewerId)
      .map((r) => ({
        userId: r.reviewerId!,
        name: userName(r.reviewerId!, reviewLoadUsers),
        assigned: r._count._all,
      })),
  };

  // Risks — reuse the monthly recap for §7.
  const recap = await buildRecap(wid, "month", { force: false }).catch(() => null);
  const risks = (recap?.items || []).filter((it) => it.severity === "warn" || it.severity === "celebrate").slice(0, 6);

  // Pipeline health score — 50% speed (lower TtH is better), 30% quality
  // (% above 85 fit), 20% hygiene (fewer stalled). Bounded 0..100.
  const stalledCount = risks.filter((r) => r.id === "stalled_candidates").length;
  const aboveFit = sourceQualityRaw.filter((a) => (a.aiFit ?? 0) >= 85).length;
  const fitTotal = sourceQualityRaw.length;
  const speedScore = timeToHireDays != null ? Math.max(0, Math.min(100, 100 - timeToHireDays * 2)) : 50;
  const qualityScore = fitTotal > 0 ? Math.round((aboveFit / fitTotal) * 100) : 50;
  const hygieneScore = Math.max(0, 100 - stalledCount * 10);
  const pipelineHealthScore = Math.round(speedScore * 0.5 + qualityScore * 0.3 + hygieneScore * 0.2);

  // ── 1 & 6 — AI headline + "what changed" narrative (optional) ─────
  const aiOn = await isAIEnabled(workspaceId, "recap");
  let headline =
    `In ${monthLabel(scopeStart)}, ${ws.name} processed ${apps} application${apps === 1 ? "" : "s"} ` +
    `and made ${hires} hire${hires === 1 ? "" : "s"}` +
    (timeToHireDays != null ? `, with a ${timeToHireDays}-day mean time-to-hire.` : ".");
  let whatChanged = appsPrev > 0
    ? `Application volume ${apps >= appsPrev ? "rose" : "fell"} by ${Math.abs(Math.round(((apps - appsPrev) / appsPrev) * 100))}% versus last month.`
    : `Last month had no application data to compare against.`;
  let hasAI = false;
  if (aiOn) {
    const ai = await generateAINarrative(workspaceId, {
      workspaceName: ws.name,
      bucket,
      numbers: { apps, appsPrev, hires, offers, timeToHireDays, openRoles, pipelineHealthScore },
      sources,
      pipelineHealth,
    }).catch(() => null);
    if (ai) {
      headline = ai.headline || headline;
      whatChanged = ai.whatChanged || whatChanged;
      hasAI = true;
    }
  }

  return {
    workspaceId: wid,
    workspaceName: ws.name,
    bucket,
    generatedAt: new Date(),
    scopeStart,
    scopeEnd,
    headline,
    numbers: {
      applications: apps,
      hires,
      offers,
      timeToHireDays,
      openRoles,
      activeCandidates,
      pipelineHealthScore,
    },
    pipelineHealth,
    sources,
    roles,
    whatChanged,
    risks,
    team,
    hasAI,
  };
}

async function generateAINarrative(
  workspaceId: string,
  context: Record<string, unknown>,
): Promise<{ headline: string; whatChanged: string } | null> {
  const system = [
    "You write the board-pack narrative for a monthly hiring report.",
    "Two short paragraphs only, strict JSON output.",
    "",
    "Hard rules:",
    "- Use only facts in CONTEXT. Never invent numbers.",
    "- Each paragraph 2–3 sentences, factual, no clichés.",
    "- Never reference protected attributes.",
    "- Output: {\"headline\": string, \"whatChanged\": string}. No prose outside JSON.",
  ].join("\n");
  const user = `Generate the monthly narrative. CONTEXT:\n${JSON.stringify(context, null, 2)}`;
  let result;
  try {
    result = await complete(workspaceId, system, user, { maxTokens: 800 });
  } catch {
    return null;
  }
  if (result.mocked) return null;
  let cleaned = result.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!cleaned.startsWith("{")) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) cleaned = m[0];
  }
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.headline !== "string" || typeof parsed.whatChanged !== "string") return null;
    return { headline: parsed.headline.slice(0, 800), whatChanged: parsed.whatChanged.slice(0, 800) };
  } catch {
    return null;
  }
}

function monthLabel(d: Date) {
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}
