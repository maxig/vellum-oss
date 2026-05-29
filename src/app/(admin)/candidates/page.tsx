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
          include: { job: true, stage: true },
          orderBy: { appliedAt: "desc" },
          take: 1,
        },
        threads: { orderBy: { lastAt: "desc" }, take: 1 },
      },
    }),
  ]);

  return (
    <CandidatesDatabase
      currentUser={{ id: user.id, name: user.name || user.email }}
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
