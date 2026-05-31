// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import KanbanBoard from "./KanbanBoard";

export const dynamic = "force-dynamic";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const { workspace, user } = await requireWorkspace();
  const sp = await searchParams;

  const jobs = await db.job.findMany({
    where: { workspaceId: workspace.id, status: { in: ["Open", "Draft"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      department: true,
      location: true,
      _count: { select: { applications: true } },
    },
  });

  if (jobs.length === 0) {
    return (
      <div className="page">
        <h1>Pipeline</h1>
        <p className="muted" style={{ marginTop: 8 }}>You haven't created any jobs yet.</p>
        <Link href="/jobs" className="btn btn-primary" style={{ marginTop: 20 }}>Create your first job</Link>
      </div>
    );
  }

  const activeJob = jobs.find((j) => j.id === sp.job) || jobs[0];

  const [stages, apps] = await Promise.all([
    db.stage.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { position: "asc" },
    }),
    db.application.findMany({
      where: { workspaceId: workspace.id, jobId: activeJob.id, archived: false },
      include: {
        candidate: {
          include: {
            notes: { include: { author: true }, orderBy: { createdAt: "desc" }, take: 6 },
            threads: {
              where: { jobId: activeJob.id },
              select: { id: true },
              orderBy: { lastAt: "desc" },
              take: 1,
            },
          },
        },
        interviews: { orderBy: { scheduledAt: "asc" }, take: 4 },
      },
      orderBy: { appliedAt: "desc" },
    }),
  ]);

  return (
    <div style={{ height: "100%", minHeight: 0 }}>
      <KanbanBoard
        activeJobId={activeJob.id}
        currentUser={{
          id: user.id,
          name: user.name || user.email,
          signature: user.signature || workspace.signature || "",
        }}
        jobs={jobs.map((j) => ({
          id: j.id,
          title: j.title,
          status: j.status,
          department: j.department || "",
          location: j.location || "",
          applicants: j._count.applications,
        }))}
        stages={stages.map((s) => ({ id: s.id, key: s.key, name: s.name, color: s.color }))}
        applications={apps.map((a) => ({
          id: a.id,
          jobId: a.jobId,
          stageId: a.stageId,
          aiFit: a.aiFit,
          aiSummary: a.aiSummary,
          resumeUrl: a.resumeUrl,
          resumeName: a.resumeName,
          whyUs: a.whyUs,
          screeningAnswers: normalizeJsonObject(a.screeningAnswers),
          appliedAt: a.appliedAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
          candidate: {
            id: a.candidate.id,
            name: a.candidate.name,
            email: a.candidate.email,
            currentRole: a.candidate.currentRole || "",
            location: a.candidate.location || "",
            linkedin: a.candidate.linkedin,
            portfolio: a.candidate.portfolio,
            github: a.candidate.github,
            years: a.candidate.years,
            source: a.candidate.source || "",
            skills: normalizeStringArray(a.candidate.skills),
            createdAt: a.candidate.createdAt.toISOString(),
          },
          interviews: a.interviews.map((iv) => ({
            id: iv.id,
            scheduledAt: iv.scheduledAt.toISOString(),
            kind: iv.kind,
            durationMin: iv.durationMin,
          })),
          notes: a.candidate.notes.map((n) => ({
            id: n.id,
            body: n.body,
            author: n.author.name || n.author.email,
            createdAt: n.createdAt.toISOString(),
          })),
          threadId: a.candidate.threads[0]?.id || null,
        }))}
      />
    </div>
  );
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeJsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
