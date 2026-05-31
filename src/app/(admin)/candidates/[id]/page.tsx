// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import CandidateView from "./CandidateView";

export const dynamic = "force-dynamic";

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { workspace, user, membership } = await requireWorkspace();
  const { id } = await params;

  const candidate = await db.candidate.findFirst({
    where: { id, workspaceId: workspace.id },
    include: {
      applications: { include: { job: true, stage: true, interviews: true }, orderBy: { appliedAt: "desc" } },
      notes: { include: { author: true }, orderBy: { createdAt: "desc" } },
      threads: { orderBy: { lastAt: "desc" }, take: 1 },
    },
  });
  if (!candidate) return notFound();

  const stages = await db.stage.findMany({ where: { workspaceId: workspace.id }, orderBy: { position: "asc" } });

  return (
    <CandidateView
      currentUser={{
        id: user.id,
        name: user.name || user.email,
        signature: user.signature || workspace.signature || "",
      }}
      currentRole={membership.role}
      candidate={{
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
        location: candidate.location,
        linkedin: candidate.linkedin,
        portfolio: candidate.portfolio,
        github: candidate.github,
        currentRole: candidate.currentRole,
        years: candidate.years,
        source: candidate.source,
        skills: (candidate.skills as string[]) || [],
        createdAt: candidate.createdAt.toISOString(),
      }}
      applications={candidate.applications.map((a) => ({
        id: a.id,
        jobId: a.jobId,
        jobTitle: a.job.title,
        stageKey: a.stage?.key || "applied",
        stageName: a.stage?.name || "Applied",
        stageColor: a.stage?.color || "oklch(70% 0.06 250)",
        aiFit: a.aiFit,
        aiSummary: a.aiSummary,
        whyUs: a.whyUs,
        resumeUrl: a.resumeUrl,
        appliedAt: a.appliedAt.toISOString(),
        interviews: a.interviews.map((iv) => ({
          id: iv.id,
          scheduledAt: iv.scheduledAt.toISOString(),
          kind: iv.kind,
          durationMin: iv.durationMin,
        })),
      }))}
      notes={candidate.notes.map((n) => ({
        id: n.id,
        body: n.body,
        author: n.author.name || n.author.email,
        createdAt: n.createdAt.toISOString(),
      }))}
      stages={stages.map((s) => ({ id: s.id, key: s.key, name: s.name, color: s.color }))}
      threadId={candidate.threads[0]?.id || null}
    />
  );
}
