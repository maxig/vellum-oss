// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { publicScheme } from "@/lib/app-host";
import { db } from "@/lib/db";
import JobDetail from "./JobDetail";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { workspace, membership } = await requireWorkspace();
  const { id } = await params;
  const job = await db.job.findFirst({
    where: { id, workspaceId: workspace.id },
    include: {
      _count: { select: { applications: true } },
      applications: { include: { candidate: true, stage: true } },
      screening: { orderBy: { position: "asc" } },
      hiringTeam: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!job) return notFound();
  const stages = await db.stage.findMany({ where: { workspaceId: workspace.id }, orderBy: { position: "asc" } });
  const members = await db.membership.findMany({
    where: { workspaceId: workspace.id },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  const sevenDaysAgo = Date.now() - 7 * 86_400_000;
  const newThisWeek = job.applications.filter((a) => a.appliedAt.getTime() >= sevenDaysAgo).length;

  const byStageKey: Record<string, number> = {};
  for (const a of job.applications) {
    const k = a.stage?.key || "applied";
    byStageKey[k] = (byStageKey[k] || 0) + 1;
  }

  // Heuristic "median days in stage" — for the OSS demo we approximate with
  // the average application age, which is close enough to be useful without
  // requiring a stage-transitions table.
  const now = Date.now();
  const ages = job.applications.map((a) => (now - a.appliedAt.getTime()) / 86_400_000);
  const avgAge = ages.length ? Math.round(ages.reduce((s, v) => s + v, 0) / ages.length) : 0;

  return (
    <JobDetail
      job={{
        id: job.id,
        slug: job.slug,
        title: job.title,
        department: job.department,
        location: job.location,
        employment: job.employment,
        status: job.status,
        pitch: job.pitch,
        description: job.description,
        requirements: (job.requirements as string[]) || [],
        niceToHave: (job.niceToHave as string[]) || [],
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        // Always prefer the workspace's current setting so toggling currency
        // in settings updates every job's display in lock-step.
        salaryCurrency: workspace.currency || job.salaryCurrency || "EUR",
        salaryDisplay: job.salaryDisplay,
        processSteps: (job.processSteps as { n: string; who: string; d: string }[]) || [],
        leadReviewerId: job.leadReviewerId,
        hiringTeam: job.hiringTeam.map((m) => ({
          userId: m.userId,
          name: m.user.name || m.user.email,
          email: m.user.email,
          role: m.role,
        })),
        channels: (job.channels as Record<string, boolean>) || {},
        publishedAt: job.publishedAt?.toISOString() || null,
        createdAt: job.createdAt.toISOString(),
        applicantCount: job._count.applications,
        newThisWeek,
        avgAge,
        screening: job.screening.map((q) => ({ id: q.id, label: q.label, kind: q.kind, required: q.required })),
      }}
      workspaceSlug={workspace.slug}
      publicDomain={process.env.PUBLIC_DOMAIN || "localhost:3000"}
      publicScheme={publicScheme()}
      stages={stages.map((s) => ({ key: s.key, name: s.name, color: s.color, count: byStageKey[s.key] || 0 }))}
      members={members.map((m) => ({
        id: m.user.id,
        name: m.user.name || m.user.email,
        email: m.user.email,
        role: m.role,
      }))}
      currentRole={membership.role}
    />
  );
}
