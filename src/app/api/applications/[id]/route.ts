// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { recordStageMove } from "@/lib/stage-history";
import { recordSignal } from "@/lib/pulse";
import { canEditApplication } from "@/lib/permissions";

const Patch = z.object({
  stageId: z.string().optional(),
  aiFit: z.number().int().min(0).max(100).optional(),
  archived: z.boolean().optional(),
  reviewerId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { workspace, user, membership } = await requireWorkspace();
  const { id } = await params;
  const body = Patch.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  // canEditApplication = admin/owner OR the current reviewer. Members
  // who aren't the reviewer (even if they're on the hiring team or an
  // interviewer) can READ the application but not mutate its stage /
  // reviewerId / archived. See ROLES.md §3.
  const allowed = await canEditApplication(user.id, id, workspace.id, membership.role);
  if (!allowed) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const app = await db.application.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { candidate: true, stage: true },
  });
  if (!app) return NextResponse.json({ error: "not found" }, { status: 404 });

  let newStage: { id: string; key: string; name: string } | null = null;
  if (body.data.stageId) {
    const ns = await db.stage.findFirst({ where: { id: body.data.stageId, workspaceId: workspace.id } });
    if (!ns) return NextResponse.json({ error: "bad stage" }, { status: 400 });
    newStage = { id: ns.id, key: ns.key, name: ns.name };
  }

  await db.application.update({
    where: { id },
    data: body.data,
  });

  if (newStage && newStage.id !== app.stageId) {
    // Stage history — captures from → to with the actor. Powers the
    // recap stage_moves item and the median-time-in-stage calc.
    await recordStageMove({
      workspaceId: workspace.id,
      applicationId: app.id,
      candidateId: app.candidateId,
      jobId: app.jobId,
      fromStageId: app.stageId,
      fromStageKey: app.stage?.key || null,
      toStageId: newStage.id,
      toStageKey: newStage.key,
      actorId: user.id,
      actorName: user.name || user.email,
    });

    // Pulse — stage_advanced resets the decay clock for the candidate so
    // an at-offer candidate isn't dragged down by old "no reply" signals.
    await recordSignal({
      workspaceId: workspace.id,
      candidateId: app.candidateId,
      kind: "stage_advanced",
      source: "system",
      evidence: { applicationId: app.id, fromStage: app.stage?.key, toStage: newStage.key },
    }).catch(() => null);

    if (newStage.key === "offer") {
      await recordSignal({
        workspaceId: workspace.id,
        candidateId: app.candidateId,
        kind: "offer_sent",
        source: "system",
        evidence: { applicationId: app.id },
      }).catch(() => null);
    }

    await db.activity.create({
      data: {
        workspaceId: workspace.id,
        actorId: user.id,
        actorName: user.name || user.email,
        kind: "moved",
        body: `${app.candidate.name} → ${newStage.name}`,
        candidateId: app.candidateId,
        jobId: app.jobId,
        icon: "Pipeline",
      },
    });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Delete an application. Anonymizes the analytic trail (stage history,
 * activity log) instead of cascade-wiping it, so the funnel stats stay
 * intact even after the recruiter rejects/removes someone. Notes,
 * interviews, and debriefs (PII-bearing) cascade-delete normally.
 *
 * Owner/admin only — recruiters can move candidates and archive, but only
 * an admin can permanently delete an application.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { workspace, membership, user } = await requireWorkspace();
  const { id } = await params;
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const app = await db.application.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { candidate: { select: { name: true } } },
  });
  if (!app) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Detach stage history first so the analytic trail isn't wiped when the
  // application row is removed. application onDelete is SetNull but we
  // also clear candidateId/actor so nothing PII references the deletion.
  await db.candidateStageHistory.updateMany({
    where: { workspaceId: workspace.id, applicationId: id },
    data: { applicationId: null, candidateId: null, actorId: null, actorName: null },
  }).catch(() => null);

  // Drop activity entries' link to this application's candidate where the
  // entry is solely about this application (e.g. stage moves on it).
  await db.activity.updateMany({
    where: { workspaceId: workspace.id, candidateId: app.candidateId, jobId: app.jobId },
    data: { actorName: null },
  }).catch(() => null);

  await db.application.delete({ where: { id } });

  await db.activity.create({
    data: {
      workspaceId: workspace.id,
      actorId: user.id,
      actorName: user.name || user.email,
      kind: "deleted",
      icon: "X",
      body: `Removed an application for ${app.candidate.name}.`,
      jobId: app.jobId,
    },
  });

  return NextResponse.json({ ok: true });
}
