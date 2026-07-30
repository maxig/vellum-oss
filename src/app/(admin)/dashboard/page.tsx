// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { Glass, Avatar, Icons } from "@/components/primitives";
import { relativeTime } from "@/lib/utils";
import { readCachedRecap } from "@/lib/recap";
import RecapCard from "@/components/RecapCard";
import DashboardTodos from "@/components/DashboardTodos";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

export default async function DashboardPage() {
  const { workspace, user } = await requireWorkspace();
  const wid = workspace.id;
  const now = Date.now();
  const twelveWeeksAgo = new Date(now - 12 * 7 * DAY);
  const fourWeeksAgo = new Date(now - 4 * 7 * DAY);
  const eightWeeksAgo = new Date(now - 8 * 7 * DAY);
  const ninetyDaysAgo = new Date(now - 90 * DAY);

  const [
    stages,
    activeApps,
    hiredApps,
    rejectedAfterOfferApps,
    appsLast12Weeks,
    appsLast4Weeks,
    appsPrev4Weeks,
    activity,
    upcomingInterviews,
    sources,
    unreadThreads,
    repliesNeeded,
    waitingOver48h,
    jobsOpen,
    jobsDraft,
  ] = await Promise.all([
    // Pipeline stages, in display order.
    db.stage.findMany({ where: { workspaceId: wid }, orderBy: { position: "asc" } }),
    // All non-archived applications joined with stage — used for funnel,
    // "active candidates", and "need interview" computations.
    db.application.findMany({
      where: { workspaceId: wid, archived: false },
      include: { stage: true, interviews: { take: 1 } },
    }),
    db.application.count({
      where: { workspaceId: wid, stage: { key: "hired" }, updatedAt: { gte: ninetyDaysAgo } },
    }),
    // Approximation for "offers that fell through": apps rejected after they
    // reached the offer stage. We don't keep stage-transition history, so we
    // count anything currently in `rejected` whose updatedAt is recent enough
    // to still be relevant for the quarterly accept rate.
    db.application.count({
      where: { workspaceId: wid, stage: { key: "rejected" }, updatedAt: { gte: ninetyDaysAgo } },
    }),
    // For the bar chart. Pull appliedAt timestamps and bucket them in JS.
    db.application.findMany({
      where: { workspaceId: wid, appliedAt: { gte: twelveWeeksAgo } },
      select: { appliedAt: true },
    }),
    db.application.count({ where: { workspaceId: wid, appliedAt: { gte: fourWeeksAgo } } }),
    db.application.count({
      where: { workspaceId: wid, appliedAt: { gte: eightWeeksAgo, lt: fourWeeksAgo } },
    }),
    db.activity.findMany({
      where: { workspaceId: wid },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.interview.findMany({
      where: { workspaceId: wid, scheduledAt: { gte: new Date() } },
      orderBy: { scheduledAt: "asc" },
      take: 4,
      include: { application: { include: { candidate: true, job: true } } },
    }),
    db.candidate.groupBy({ by: ["source"], where: { workspaceId: wid }, _count: { _all: true } }),
    db.thread.count({ where: { workspaceId: wid, unread: true } }),
    // "Need first reply" — fresh applications in the very first stage where
    // we haven't sent anything outbound yet.
    db.application.count({
      where: {
        workspaceId: wid,
        archived: false,
        stage: { key: "applied" },
      },
    }),
    // "Waiting more than 48h" — anything past the applied stage that hasn't
    // moved or been touched in the last two days.
    db.application.count({
      where: {
        workspaceId: wid,
        archived: false,
        stage: { key: { in: ["screen", "interview", "offer"] } },
        updatedAt: { lt: new Date(now - 2 * DAY) },
      },
    }),
    db.job.count({ where: { workspaceId: wid, status: "Open" } }),
    db.job.count({ where: { workspaceId: wid, status: "Draft" } }),
  ]);

  // Today's recap — READS CACHE ONLY. The recap worker
  // (lib/recap-worker.ts) refreshes the cache every 15 minutes in the
  // background, so the dashboard never blocks on the LLM call. On a cold
  // start (no cache row yet), we render a "warming up" line — the worker
  // populates within ~30 seconds of boot.
  const recap = await readCachedRecap(wid, "today").catch(() => null);

  // ── Derived metrics ───────────────────────────────────────────────────

  // "Active candidates" — anyone in the pipeline that isn't hired or rejected.
  const activeCandidates = activeApps.filter(
    (a) => a.stage?.key !== "hired" && a.stage?.key !== "rejected",
  ).length;

  // Funnel counts per stage.
  const funnel = stages.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    count: activeApps.filter((a) => a.stageId === s.id).length,
  }));
  const funnelMax = Math.max(1, ...funnel.map((f) => f.count));

  // Need an interview scheduled — at the screen stage but no interview rows.
  const needsInterview = activeApps.filter(
    (a) => a.stage?.key === "screen" && a.interviews.length === 0,
  ).length;
  const waitingOnYou = repliesNeeded + needsInterview + waitingOver48h;

  // Time to hire — mean days from applied → hired for the last 90 days.
  const hiredForTtH = await db.application.findMany({
    where: {
      workspaceId: wid,
      stage: { key: "hired" },
      updatedAt: { gte: ninetyDaysAgo },
    },
    select: { appliedAt: true, updatedAt: true },
  });
  const timeToHire = hiredForTtH.length
    ? Math.round(
        hiredForTtH.reduce((sum, a) => sum + (a.updatedAt.getTime() - a.appliedAt.getTime()) / DAY, 0) /
          hiredForTtH.length,
      )
    : null;

  // Offer accept rate — hires vs hires + late-stage rejections (a rough proxy
  // until we record stage-transition history).
  const offerAcceptRate =
    hiredApps + rejectedAfterOfferApps > 0
      ? Math.round((hiredApps / (hiredApps + rejectedAfterOfferApps)) * 100)
      : null;

  // Bucket applications into 12 weekly buckets, oldest first.
  const buckets = new Array(12).fill(0) as number[];
  const weekStart = (d: Date) => {
    const day = d.getDay();
    const ms = d.getTime() - day * DAY;
    return new Date(new Date(ms).setHours(0, 0, 0, 0));
  };
  const oldestBucket = weekStart(twelveWeeksAgo).getTime();
  for (const app of appsLast12Weeks) {
    const idx = Math.min(
      11,
      Math.max(0, Math.floor((app.appliedAt.getTime() - oldestBucket) / (7 * DAY))),
    );
    buckets[idx] += 1;
  }
  const barMax = Math.max(1, ...buckets);
  const momDelta =
    appsPrev4Weeks > 0
      ? Math.round(((appsLast4Weeks - appsPrev4Weeks) / appsPrev4Weeks) * 100)
      : appsLast4Weeks > 0
      ? 100
      : 0;

  // Sources — group and surface the top five.
  const sourceTotal = sources.reduce((a, s) => a + s._count._all, 0) || 1;
  const sourcesPct = sources
    .map((s) => ({ name: s.source || "Other", count: s._count._all, pct: s._count._all / sourceTotal }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const greeting = greet(new Date());
  const firstName = (user.name || user.email || "there").split(/\s|@/)[0];

  return (
    <div className="page">
      {/* Hero */}
      <div className="row" style={{ marginBottom: 24, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <div className="tiny" style={{ marginBottom: 6 }}>
            {greeting}, {firstName}
          </div>
          {waitingOnYou > 0 ? (
            <>
              <h1 style={{ fontSize: 36, letterSpacing: "-0.02em" }}>
                You have{" "}
                <span style={{ color: "var(--accent-solid)" }}>
                  {waitingOnYou} candidate{waitingOnYou === 1 ? "" : "s"}
                </span>{" "}
                waiting on you.
              </h1>
              <p style={{ marginTop: 10, fontSize: 15, maxWidth: 600 }}>
                {[
                  needsInterview && `${needsInterview} need an interview scheduled`,
                  repliesNeeded && `${repliesNeeded} need a first reply`,
                  waitingOver48h && `${waitingOver48h} have been waiting more than 48 hours`,
                ]
                  .filter(Boolean)
                  .join(", ") + "."}
              </p>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 36, letterSpacing: "-0.02em" }}>
                Inbox zero — <span style={{ color: "var(--accent-solid)" }}>nice.</span>
              </h1>
              <p className="muted" style={{ marginTop: 10, fontSize: 15, maxWidth: 600 }}>
                {jobsOpen} open role{jobsOpen === 1 ? "" : "s"} · {appsLast4Weeks} new applicants in the last 4 weeks.
              </p>
            </>
          )}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link href="/settings" className="btn">
            Invite teammate
          </Link>
          <Link href="/jobs/new" className="btn btn-primary">
            <Icons.Plus size={14} stroke={2} />
            New job
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
          marginBottom: 22,
        }}
      >
        <Stat
          label="Active candidates"
          value={activeCandidates}
          delta={appsLast4Weeks > 0 ? `↑ ${appsLast4Weeks} in 4 weeks` : "—"}
        />
        <Stat
          label="Open roles"
          value={jobsOpen}
          delta={jobsDraft > 0 ? `${jobsDraft} draft` : "all live"}
        />
        <Stat
          label="Time to hire"
          value={timeToHire != null ? timeToHire : "—"}
          unit={timeToHire != null ? "days" : undefined}
          delta={timeToHire != null ? `${hiredForTtH.length} hires · 90d` : "no hires yet"}
        />
        <Stat
          label="Offer accept rate"
          value={offerAcceptRate != null ? `${offerAcceptRate}%` : "—"}
          delta={`${hiredApps} hired · ${rejectedAfterOfferApps} not`}
        />
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14 }}>
        {/* Pipeline + chart */}
        <Glass className="card" style={{ padding: 22 }}>
          <div className="row" style={{ marginBottom: 12, alignItems: "baseline" }}>
            <h2 style={{ flex: 1, fontSize: 18 }}>Pipeline overview</h2>
            <Link href="/pipeline" className="btn btn-sm btn-ghost">
              Open pipeline <Icons.ChevronRight size={11} />
            </Link>
          </div>

          {funnel.length === 0 ? (
            <p className="muted">No stages yet — visit Settings to create your pipeline.</p>
          ) : (
            <div style={{ marginBottom: 22 }}>
              {funnel.map((f) => (
                <div key={f.id} className="funnel-row">
                  <div className="row" style={{ gap: 8 }}>
                    <span className="chip-dot" style={{ background: f.color }} />
                    <span style={{ fontSize: 13 }}>{f.name}</span>
                  </div>
                  <div className="funnel-bar">
                    <div
                      className="funnel-fill"
                      style={{ width: `${Math.max(2, (f.count / funnelMax) * 100)}%` }}
                    />
                  </div>
                  <div
                    className="mono"
                    style={{ fontSize: 12, textAlign: "right", color: "var(--ink-1)" }}
                  >
                    {f.count}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="divider" style={{ margin: "8px 0 18px", height: 1, background: "var(--line)" }} />

          <div className="row" style={{ marginBottom: 8 }}>
            <h4 style={{ flex: 1, fontSize: 14 }}>Applications · last 12 weeks</h4>
            {appsPrev4Weeks > 0 ? (
              <span
                className="chip"
                style={momDelta < 0 ? { color: "oklch(62% 0.16 28)" } : undefined}
              >
                {momDelta >= 0 ? "+" : ""}
                {momDelta}% MoM
              </span>
            ) : appsLast4Weeks > 0 ? (
              <span className="chip">first wave</span>
            ) : null}
          </div>
          <div className="bar-chart">
            {buckets.map((b, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "flex-end",
                  height: "100%",
                  minWidth: 0,
                }}
                title={`Week ${i + 1}: ${b} application${b === 1 ? "" : "s"}`}
              >
                <div
                  className="bar"
                  style={{
                    width: "100%",
                    height: `${Math.max(4, (b / barMax) * 100)}%`,
                    opacity: i < buckets.length - 1 ? 0.7 : 1,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 6, justifyContent: "space-between" }}>
            <span className="tiny">12 weeks ago</span>
            <span className="tiny">This week</span>
          </div>
        </Glass>

        {/* Right column */}
        <div className="col" style={{ gap: 14 }}>
          <Glass className="card" style={{ padding: 22 }}>
            <div className="row" style={{ marginBottom: 12, alignItems: "baseline" }}>
              <h2 style={{ flex: 1, fontSize: 18 }}>Upcoming interviews</h2>
              <Link href="/pipeline" className="tiny" style={{ color: "var(--accent-solid)" }}>
                Pipeline →
              </Link>
            </div>
            {upcomingInterviews.length === 0 ? (
              <p className="muted" style={{ paddingTop: 8 }}>
                Nothing scheduled yet.
              </p>
            ) : (
              <div className="col" style={{ gap: 0 }}>
                {upcomingInterviews.map((iv, i) => (
                  <div
                    key={iv.id}
                    className="row"
                    style={{
                      padding: "10px 0",
                      borderBottom:
                        i < upcomingInterviews.length - 1 ? "0.5px solid var(--line)" : "none",
                      gap: 12,
                    }}
                  >
                    <Avatar name={iv.application.candidate.name} size="md" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-0)" }}>
                        {iv.application.candidate.name}
                      </div>
                      <div className="tiny" style={{ marginTop: 2 }}>
                        {iv.kind} · {iv.application.job.title}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>
                        {iv.scheduledAt.toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                      <div className="tiny mono">
                        {iv.scheduledAt.toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Glass>

          <DashboardTodos />

          <Glass className="card" style={{ padding: 22 }}>
            <div className="row" style={{ marginBottom: 12, alignItems: "baseline" }}>
              <h2 style={{ flex: 1, fontSize: 18 }}>Where they come from</h2>
            </div>
            {sourcesPct.length === 0 ? (
              <p className="muted" style={{ paddingTop: 4 }}>
                No applicants yet.
              </p>
            ) : (
              <div className="col" style={{ gap: 12 }}>
                {sourcesPct.map((s) => (
                  <div key={s.name}>
                    <div className="row" style={{ marginBottom: 5 }}>
                      <span style={{ fontSize: 13, flex: 1 }}>{s.name}</span>
                      <span className="mono tiny">{s.count}</span>
                    </div>
                    <div className="funnel-bar">
                      <div
                        className="funnel-fill"
                        style={{ width: `${Math.max(6, Math.round(s.pct * 100))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Glass>
        </div>
      </div>

      {/* Activity + AI recap */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, marginTop: 14 }}>
        <Glass className="card" style={{ padding: 22 }}>
          <div className="row" style={{ marginBottom: 12, alignItems: "baseline" }}>
            <h2 style={{ flex: 1, fontSize: 18 }}>Activity</h2>
            <Link href="/pipeline" className="btn btn-sm btn-ghost">
              View all
            </Link>
          </div>
          {activity.length === 0 ? (
            <p className="muted" style={{ padding: "10px 0" }}>
              No activity yet. Publish a job and the feed lights up.
            </p>
          ) : (
            <div>
              {activity.map((a) => {
                const Ic = (Icons as any)[a.icon] || Icons.Sparkle;
                return (
                  <div key={a.id} className="feed-item">
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: "var(--glass-bg-faint)",
                        border: "0.5px solid var(--line)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--ink-1)",
                        flexShrink: 0,
                      }}
                    >
                      <Ic size={14} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13 }}>
                        <b style={{ fontWeight: 500, color: "var(--ink-0)" }}>
                          {a.actorName || "Vellum"}
                        </b>{" "}
                        <span style={{ color: "var(--ink-1)" }}>{kindLabel(a.kind)}</span>
                      </div>
                      <div className="tiny" style={{ marginTop: 2 }}>{a.body}</div>
                    </div>
                    <div className="feed-meta" style={{ flexShrink: 0 }}>
                      {relativeTime(a.createdAt)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Glass>

        <RecapCard initialRecap={recap} unreadThreads={unreadThreads} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  delta,
}: {
  label: string;
  value: number | string;
  unit?: string;
  delta?: string;
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="row" style={{ alignItems: "baseline", gap: 6, marginTop: 4 }}>
        <div className="stat-value" style={{ marginTop: 0 }}>{value}</div>
        {unit && (
          <div style={{ fontSize: 14, color: "var(--ink-2)", fontWeight: 500 }}>{unit}</div>
        )}
      </div>
      {delta && <div className="stat-delta" style={{ marginTop: 4 }}>{delta}</div>}
    </div>
  );
}

// (RecapRow + renderRecapText moved into <RecapCard /> client component.)

function greet(d: Date) {
  const h = d.getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function kindLabel(kind: string) {
  switch (kind) {
    case "moved":
      return "moved a candidate";
    case "noted":
      return "left a note";
    case "scheduled":
      return "scheduled an interview";
    case "applied":
      return "applied";
    case "ai":
      return "ran AI";
    case "published":
      return "published a job";
    default:
      return kind;
  }
}
