// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import CandidatesDatabase from "./CandidatesDatabase";

export const dynamic = "force-dynamic";

export default async function CandidatesPage() {
  const { workspace, user, membership } = await requireWorkspace();

  const [stages, jobs, candidates] = await Promise.all([
    db.stage.findMany({ where: { workspaceId: workspace.id }, orderBy: { position: "asc" } }),
    db.job.findMany({ where: { workspaceId: workspace.id }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }),
    db.candidate.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: 500,
      // pulseScore / pulseBand / pulseUpdatedAt come back automatically
      // since we pull the full Candidate row.
      include: {
        applications: {
          // Only the job title + stage display fields are used below — pulling
          // the whole Job row dragged in description/pitch (@db.Text) and four
          // JSON blobs per candidate.
          include: {
            job: { select: { title: true } },
            stage: { select: { key: true, name: true, color: true } },
          },
          orderBy: { appliedAt: "desc" },
          take: 1,
        },
        threads: { orderBy: { lastAt: "desc" }, take: 1, select: { id: true } },
      },
    }),
  ]);

  // Team-rating aggregate per candidate (across all their applications —
  // Rating.candidateId is denormalized precisely so this stays one query).
  const candidateIds = candidates.map((c) => c.id);
  const ratingRows = candidateIds.length
    ? await db.rating.groupBy({
        by: ["candidateId"],
        where: { workspaceId: workspace.id, candidateId: { in: candidateIds } },
        _avg: { score: true },
        _count: { _all: true },
      })
    : [];
  const ratingByCand = new Map(
    ratingRows.map((r) => [
      r.candidateId,
      { avg: r._avg.score != null ? Math.round(r._avg.score * 10) / 10 : 0, count: r._count._all },
    ]),
  );

  return (
    <CandidatesDatabase
      currentUser={{
        id: user.id,
        name: user.name || user.email,
        signature: user.signature || workspace.signature || "",
      }}
      currentRole={membership.role}
      stages={stages.map((s) => ({ id: s.id, key: s.key, name: s.name, color: s.color }))}
      jobs={jobs.map((j) => ({ id: j.id, title: j.title, status: j.status }))}
      candidates={candidates.map((c) => {
        const app = c.applications[0] || null;
        return {
          id: c.id,
          name: c.name,
          email: c.email,
          location: c.location,
          currentRole: c.currentRole,
          source: c.source,
          skills: (c.skills as string[] | null) || [],
          createdAt: c.createdAt.toISOString(),
          threadId: c.threads[0]?.id || null,
          pulseScore: c.pulseScore,
          pulseBand: c.pulseBand,
          rating: ratingByCand.get(c.id)?.avg ?? null,
          ratingCount: ratingByCand.get(c.id)?.count ?? 0,
          application: app
            ? {
                id: app.id,
                jobId: app.jobId,
                jobTitle: app.job.title,
                stageId: app.stageId,
                stageKey: app.stage?.key || null,
                stageName: app.stage?.name || "Unstaged",
                stageColor: app.stage?.color || "oklch(70% 0.06 250)",
                aiFit: app.aiFit,
                appliedAt: app.appliedAt.toISOString(),
                archived: app.archived,
              }
            : null,
        };
      })}
    />
  );
}
