// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { purgeRecapCacheForCandidate } from "@/lib/recap";

const Patch = z.object({
  name: z.string().min(1).max(160).optional(),
  email: z.string().email().nullable().optional(),
  location: z.string().max(160).nullable().optional(),
  currentRole: z.string().max(180).nullable().optional(),
  source: z.string().max(80).nullable().optional(),
  years: z.number().int().min(0).max(80).nullable().optional(),
  skills: z.array(z.string().min(1).max(60)).optional(),
  addSkill: z.string().min(1).max(60).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { workspace, user } = await requireWorkspace();
  const { id } = await params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const candidate = await db.candidate.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!candidate) return NextResponse.json({ error: "not found" }, { status: 404 });

  const currentSkills = (candidate.skills as string[] | null) || [];
  const nextSkills = parsed.data.skills
    ? Array.from(new Set(parsed.data.skills.map((s) => s.trim()).filter(Boolean)))
    : parsed.data.addSkill
      ? Array.from(new Set([...currentSkills, parsed.data.addSkill.trim()].filter(Boolean)))
      : undefined;

  const updated = await db.candidate.update({
    where: { id },
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      location: parsed.data.location,
      currentRole: parsed.data.currentRole,
      source: parsed.data.source,
      years: parsed.data.years,
      skills: nextSkills,
    },
  });

  if (parsed.data.addSkill) {
    await db.activity.create({
      data: {
        workspaceId: workspace.id,
        actorId: user.id,
        actorName: user.name || user.email,
        kind: "tagged",
        icon: "Plus",
        body: `Added ${parsed.data.addSkill.trim()} to ${candidate.name}`,
        candidateId: candidate.id,
      },
    });
  }

  return NextResponse.json({ id: updated.id });
}

/**
 * GDPR "Right to be Forgotten" — strip the candidate from the workspace.
 *
 * We do NOT cascade-delete: that would also wipe the analytic trail
 * (stage history, activity, career-site events) the team relies on for
 * funnel and conversion reporting. Instead we anonymize:
 *
 *   1. Stage-history rows for this candidate's applications keep their
 *      stage transitions but their candidateId/applicationId/actor are
 *      nulled. They stay in the funnel counts.
 *   2. Activity log entries lose their candidateId pointer and any actor
 *      name that revealed the candidate.
 *   3. PII-bearing children (notes, threads + messages, pulse signals,
 *      sentiment results, applications, interviews, debriefs) are deleted.
 *   4. The Candidate row itself is removed.
 *
 * Owner/admin only — recruiters can't vaporise a candidate's data.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { workspace, membership, user } = await requireWorkspace();
  const { id } = await params;
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const candidate = await db.candidate.findFirst({
    where: { id, workspaceId: workspace.id },
    select: { id: true, name: true, applications: { select: { id: true } } },
  });
  if (!candidate) return NextResponse.json({ error: "not found" }, { status: 404 });

  const appIds = candidate.applications.map((a) => a.id);

  // 1. Detach stage history — null out candidate/application/actor refs
  //    so we keep the from→to+timestamp facts for analytics.
  await db.candidateStageHistory.updateMany({
    where: { workspaceId: workspace.id, candidateId: id },
    data: { candidateId: null, applicationId: null, actorId: null, actorName: null },
  }).catch(() => null);

  // 2. Detach activity log entries from the candidate.
  await db.activity.updateMany({
    where: { workspaceId: workspace.id, candidateId: id },
    data: { candidateId: null, actorName: null },
  }).catch(() => null);

  // 3. Sentiment results aren't cascaded — explicit cleanup keeps them
  //    from sticking around as orphaned audit data referencing the
  //    candidate by id.
  await db.sentimentResult.deleteMany({ where: { workspaceId: workspace.id, candidateId: id } }).catch(() => null);

  // 4. Cascade fires for: applications, threads, notes, pulse signals,
  //    interviews, debriefs (all wired in schema.prisma with
  //    onDelete: Cascade from the candidate).
  await db.candidate.delete({ where: { id } });

  await db.activity.create({
    data: {
      workspaceId: workspace.id,
      actorId: user.id,
      actorName: user.name || user.email,
      kind: "deleted",
      icon: "X",
      body: `Removed a candidate (GDPR right-to-be-forgotten · ${appIds.length} application${appIds.length === 1 ? "" : "s"} cleared).`,
    },
  });

  // Recap cache invalidation — conservative purge so we never serve a
  // stale recap that names the deleted candidate.
  await purgeRecapCacheForCandidate(workspace.id, id).catch(() => null);

  return NextResponse.json({ ok: true });
}
