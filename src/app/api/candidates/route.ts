// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";

const Body = z.object({
  name: z.string().min(1).max(160),
  email: z.string().email().optional().or(z.literal("")),
  location: z.string().max(160).optional().or(z.literal("")),
  currentRole: z.string().max(180).optional().or(z.literal("")),
  source: z.string().max(80).optional().or(z.literal("")),
  years: z.number().int().min(0).max(80).optional().nullable(),
  skills: z.array(z.string().min(1).max(60)).optional(),
  jobId: z.string().optional().or(z.literal("")),
  stageId: z.string().optional().or(z.literal("")),
});

export async function POST(req: Request) {
  const { workspace, user } = await requireWorkspace();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const data = parsed.data;
  const email = data.email?.trim().toLowerCase() || null;
  const skills = Array.from(new Set((data.skills || []).map((s) => s.trim()).filter(Boolean)));

  let candidate = email
    ? await db.candidate.findFirst({ where: { workspaceId: workspace.id, email } })
    : null;

  if (!candidate) {
    candidate = await db.candidate.create({
      data: {
        workspaceId: workspace.id,
        name: data.name.trim(),
        email,
        location: data.location?.trim() || null,
        currentRole: data.currentRole?.trim() || null,
        source: data.source?.trim() || "Sourced",
        years: data.years ?? null,
        skills,
      },
    });
  } else {
    const currentSkills = Array.isArray(candidate.skills) ? candidate.skills.filter((s): s is string => typeof s === "string") : [];
    candidate = await db.candidate.update({
      where: { id: candidate.id },
      data: {
        name: data.name.trim(),
        location: data.location?.trim() || candidate.location,
        currentRole: data.currentRole?.trim() || candidate.currentRole,
        source: data.source?.trim() || candidate.source,
        years: data.years ?? candidate.years,
        ...(skills.length ? { skills: Array.from(new Set([...currentSkills, ...skills])) } : {}),
      },
    });
  }

  const jobId = data.jobId || null;
  if (jobId) {
    const job = await db.job.findFirst({ where: { id: jobId, workspaceId: workspace.id } });
    if (!job) return NextResponse.json({ error: "bad job" }, { status: 400 });

    let stageId = data.stageId || null;
    if (stageId) {
      const stage = await db.stage.findFirst({ where: { id: stageId, workspaceId: workspace.id } });
      if (!stage) return NextResponse.json({ error: "bad stage" }, { status: 400 });
    } else {
      stageId = (await db.stage.findFirst({ where: { workspaceId: workspace.id, key: "applied" } }))?.id || null;
    }

    await db.application.upsert({
      where: { candidateId_jobId: { candidateId: candidate.id, jobId } },
      update: { stageId, archived: false },
      create: { workspaceId: workspace.id, candidateId: candidate.id, jobId, stageId },
    });
  }

  await db.activity.create({
    data: {
      workspaceId: workspace.id,
      actorId: user.id,
      actorName: user.name || user.email,
      kind: "sourced",
      icon: "Users",
      body: `Added ${candidate.name} to candidates`,
      candidateId: candidate.id,
      jobId,
    },
  });

  return NextResponse.json({ id: candidate.id });
}
