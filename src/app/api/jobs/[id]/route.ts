// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace, isAdmin } from "@/lib/workspace";
import { db } from "@/lib/db";
import { sanitizeRichText } from "@/lib/sanitize";

const Patch = z.object({
  status: z.enum(["Open", "Draft", "Closed"]).optional(),
  title: z.string().optional(),
  department: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  employment: z.string().optional().nullable(),
  pitch: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  requirements: z.array(z.string()).optional(),
  niceToHave: z.array(z.string()).optional(),
  salaryMin: z.number().int().optional().nullable(),
  salaryMax: z.number().int().optional().nullable(),
  salaryDisplay: z.string().optional().nullable(),
  hiringTeam: z.array(z.object({ userId: z.string(), role: z.string() })).optional(),
  leadReviewerId: z.string().nullable().optional(),
  processSteps: z
    .array(z.object({ n: z.string().default(""), who: z.string().default(""), d: z.string().default("") }))
    .optional(),
  channels: z.record(z.string(), z.boolean()).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { workspace, membership } = await requireWorkspace();
  const { id } = await params;
  const body = Patch.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  // Members can edit a job's content but only admins can change its
  // publishing status (Open / Draft / Closed) — that's what flips public
  // visibility on the career site.
  if (body.data.status && !isAdmin(membership.role)) {
    return NextResponse.json({ error: "forbidden_publish" }, { status: 403 });
  }

  const existing = await db.job.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Lead reviewer changes are admin-only: this is a transfer of
  // ownership over the role's triage, which is more than a content edit.
  if (body.data.leadReviewerId !== undefined && !isAdmin(membership.role)) {
    return NextResponse.json({ error: "forbidden_lead_reviewer" }, { status: 403 });
  }
  // Same for hiring-team changes — they grant access to the role's
  // candidates, so it's an admin action.
  if (body.data.hiringTeam !== undefined && !isAdmin(membership.role)) {
    return NextResponse.json({ error: "forbidden_hiring_team" }, { status: 403 });
  }

  // Strip relational fields out of the simple data payload — they need
  // their own nested mutations below.
  const { hiringTeam, leadReviewerId, ...scalarData } = body.data;
  const data: any = { ...scalarData };
  if (typeof body.data.description === "string") data.description = sanitizeRichText(body.data.description);
  if (body.data.status === "Open" && !existing.publishedAt) data.publishedAt = new Date();
  if (body.data.status === "Closed") data.closedAt = new Date();
  // Always clear `closedAt` when transitioning back to Open or Draft so the
  // closed-at timestamp can't go stale after a Closed → Draft → Open cycle.
  if (body.data.status === "Open" || body.data.status === "Draft") data.closedAt = null;
  if (leadReviewerId !== undefined) data.leadReviewerId = leadReviewerId;

  await db.job.update({ where: { id }, data });

  // Diff-replace the hiring team. Done outside the Job update so it
  // works whether the caller passes the field or not, and so a bad
  // userId in the list doesn't roll back the rest of the patch.
  if (hiringTeam) {
    await db.$transaction([
      db.jobHiringTeamMember.deleteMany({ where: { jobId: id } }),
      db.jobHiringTeamMember.createMany({
        data: hiringTeam.map((m) => ({ jobId: id, userId: m.userId, role: m.role })),
        skipDuplicates: true,
      }),
    ]);
  }

  if (body.data.status) {
    await db.activity.create({
      data: {
        workspaceId: workspace.id,
        kind: "published",
        icon: "Briefcase",
        body: `${existing.title} → ${body.data.status}`,
        jobId: id,
      },
    });
  }
  return NextResponse.json({ ok: true });
}

/**
 * Delete a job posting. Cascades to applications, threads, and screening
 * questions. Stage-history rows keep their jobId (analytic trail) and lose
 * their application/candidate refs via the SetNull relation.
 *
 * Owner/admin only — closing a role is a member-level action, deleting it
 * is destructive.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { workspace, membership, user } = await requireWorkspace();
  const { id } = await params;
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const job = await db.job.findFirst({
    where: { id, workspaceId: workspace.id },
    select: { id: true, title: true, applications: { select: { id: true } } },
  });
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Anonymize stage history for this job's applications so the funnel
  // analytics for this role stay intact even after the job is gone.
  const appIds = job.applications.map((a) => a.id);
  if (appIds.length > 0) {
    await db.candidateStageHistory.updateMany({
      where: { workspaceId: workspace.id, applicationId: { in: appIds } },
      data: { applicationId: null, candidateId: null, actorId: null, actorName: null },
    }).catch(() => null);
  }

  await db.job.delete({ where: { id } });

  await db.activity.create({
    data: {
      workspaceId: workspace.id,
      actorId: user.id,
      actorName: user.name || user.email,
      kind: "deleted",
      icon: "X",
      body: `Removed the job "${job.title}".`,
    },
  });

  return NextResponse.json({ ok: true });
}
