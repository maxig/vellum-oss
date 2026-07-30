// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { canReadApplication } from "@/lib/permissions";
import { aiRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { summarizeCandidate } from "@/lib/ai";

const Body = z.object({
  candidateId: z.string().min(1),
  applicationId: z.string().min(1),
});

export async function POST(req: Request) {
  const { workspace, user, membership } = await requireWorkspace();
  const rl = aiRateLimit(workspace.id, user.id);
  if (!rl.ok) return NextResponse.json({ error: "Too many AI requests." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "candidate-summary expects { candidateId, applicationId }.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // A member can only summarize (and overwrite the stored summary of) an
  // application they're connected to — this feeds resume PII to the AI.
  if (!(await canReadApplication(user.id, parsed.data.applicationId, workspace.id, membership.role))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const app = await db.application.findFirst({
    where: { id: parsed.data.applicationId, workspaceId: workspace.id },
    include: { candidate: true, job: true },
  });
  if (!app) return NextResponse.json({ error: "not found" }, { status: 404 });

  const structured = [
    app.candidate.currentRole ? `Current role: ${app.candidate.currentRole}` : null,
    app.candidate.location ? `Location: ${app.candidate.location}` : null,
    app.candidate.years ? `Years of experience: ${app.candidate.years}` : null,
    Array.isArray(app.candidate.skills) ? `Skills: ${(app.candidate.skills as string[]).join(", ")}` : null,
    app.whyUs ? `From their application:\n${app.whyUs}` : null,
  ].filter(Boolean).join("\n");

  const resumeBlob = [app.resumeText, structured].filter(Boolean).join("\n\n---\n\n");

  const requirements = Array.isArray(app.job.requirements)
    ? (app.job.requirements as unknown[]).filter((r): r is string => typeof r === "string")
    : [];

  const r = await summarizeCandidate(workspace.id, {
    name: app.candidate.name,
    resume: resumeBlob,
    jobTitle: app.job.title,
    jobDescription: app.job.description,
    requirements,
  });
  await db.application.update({ where: { id: app.id }, data: { aiSummary: r.text } });
  return NextResponse.json({ text: r.text, mocked: r.mocked });
}
