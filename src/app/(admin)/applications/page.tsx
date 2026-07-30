// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import ApplicationsBoard from "./ApplicationsBoard";

export const dynamic = "force-dynamic";

// Cross-job "Applications" overview — every active job's pipeline in one place,
// as collapsible per-job groups. Complements the single-job /pipeline board
// (deep focus on one role) with a portfolio-wide view (Teamtailor's flagship
// Applications screen).
export default async function ApplicationsPage() {
  const { workspace, user } = await requireWorkspace();

  const [stages, jobs] = await Promise.all([
    db.stage.findMany({ where: { workspaceId: workspace.id }, orderBy: { position: "asc" } }),
    db.job.findMany({
      where: { workspaceId: workspace.id, status: { in: ["Open", "Draft"] } },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        status: true,
        department: true,
        location: true,
        leadReviewerId: true,
        hiringTeam: { select: { userId: true } },
      },
    }),
  ]);

  const jobIds = jobs.map((j) => j.id);

  const apps = jobIds.length
    ? await db.application.findMany({
        where: { workspaceId: workspace.id, jobId: { in: jobIds }, archived: false },
        orderBy: { appliedAt: "desc" },
        select: {
          id: true,
          jobId: true,
          stageId: true,
          aiFit: true,
          appliedAt: true,
          updatedAt: true,
          outcome: true,
          candidate: {
            select: {
              id: true,
              name: true,
              email: true,
              currentRole: true,
              location: true,
              skills: true,
              // Only unread threads — used to flag "unread message" on the card.
              threads: { where: { unread: true }, select: { jobId: true } },
            },
          },
          // Latest stage move = when this application entered its current stage.
          stageHistory: { orderBy: { movedAt: "desc" }, take: 1, select: { movedAt: true } },
        },
      })
    : [];

  // Team rating aggregate per application — one grouped query rather than a
  // per-card subquery. Powers the star display + "Top rated" filter.
  const appIds = apps.map((a) => a.id);
  const ratingRows = appIds.length
    ? await db.rating.groupBy({
        by: ["applicationId"],
        where: { workspaceId: workspace.id, applicationId: { in: appIds } },
        _avg: { score: true },
        _count: { _all: true },
      })
    : [];
  const ratingByApp = new Map(
    ratingRows.map((r) => [
      r.applicationId,
      { avg: r._avg.score != null ? Math.round(r._avg.score * 10) / 10 : 0, count: r._count._all },
    ]),
  );

  // "My jobs" = the user leads the review or sits on the hiring team.
  const myJobIds = new Set(
    jobs
      .filter((j) => j.leadReviewerId === user.id || j.hiringTeam.some((m) => m.userId === user.id))
      .map((j) => j.id),
  );

  if (jobs.length === 0) {
    return (
      <div className="page">
        <h1>Applications</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          No active jobs yet. Publish a role and applicants will show up here.
        </p>
        <Link href="/jobs" className="btn btn-primary" style={{ marginTop: 20 }}>
          Go to jobs
        </Link>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", minHeight: 0 }}>
      <ApplicationsBoard
        currentUser={{
          id: user.id,
          name: user.name || user.email,
          signature: user.signature || workspace.signature || "",
        }}
        stages={stages.map((s) => ({ id: s.id, key: s.key, name: s.name, color: s.color }))}
        jobs={jobs.map((j) => ({
          id: j.id,
          title: j.title,
          status: j.status,
          department: j.department || "",
          location: j.location || "",
          mine: myJobIds.has(j.id),
        }))}
        applications={apps.map((a) => ({
          id: a.id,
          jobId: a.jobId,
          stageId: a.stageId,
          aiFit: a.aiFit,
          outcome: a.outcome,
          appliedAt: a.appliedAt.toISOString(),
          stageEnteredAt: (a.stageHistory[0]?.movedAt ?? a.appliedAt).toISOString(),
          rating: ratingByApp.get(a.id) ?? null,
          unread: a.candidate.threads.some((t) => t.jobId === a.jobId || t.jobId === null),
          candidate: {
            id: a.candidate.id,
            name: a.candidate.name,
            email: a.candidate.email,
            currentRole: a.candidate.currentRole || "",
            location: a.candidate.location || "",
            skills: normalizeStringArray(a.candidate.skills),
          },
        }))}
      />
    </div>
  );
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
