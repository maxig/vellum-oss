// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace, isAdmin } from "@/lib/workspace";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { sanitizeRichText } from "@/lib/sanitize";

const Body = z.object({
  title: z.string().min(1).max(200),
  department: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  employment: z.string().optional().nullable(),
  pitch: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  requirements: z.array(z.string()).default([]),
  niceToHave: z.array(z.string()).default([]),
  salaryMin: z.number().int().optional().nullable(),
  salaryMax: z.number().int().optional().nullable(),
  screeningQuestions: z.array(z.object({
    q: z.string().min(1),
    required: z.boolean().default(false),
    type: z.string().default("short"),
  })).optional(),
  // Hiring team: list of workspace users to assign + their role label.
  // Replaces the previous JSON-of-strings shape; the relation feeds both
  // the career-site display and the Review Queue's Mine-scope filter.
  hiringTeam: z.array(z.object({ userId: z.string(), role: z.string() })).optional(),
  publish: z.boolean().default(false),
});

export async function POST(req: Request) {
  const { workspace, user, membership } = await requireWorkspace();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input", detail: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  // Only admins/owners can publish a job. Members can save drafts but the
  // "publish" toggle is gated — the wizard hides it for non-admins, this
  // is the server-side enforcement.
  if (d.publish && !isAdmin(membership.role)) {
    return NextResponse.json({ error: "forbidden_publish" }, { status: 403 });
  }
  let slug = slugify(d.title);
  let n = 0;
  while (await db.job.findUnique({ where: { workspaceId_slug: { workspaceId: workspace.id, slug } } })) {
    n += 1;
    slug = `${slugify(d.title)}-${n}`;
  }

  // Default hiring-team roster: if the creator didn't specify one,
  // they're added themselves as the lead recruiter. Same person becomes
  // the lead reviewer for the job (drives Application.reviewerId
  // defaults on new applications — see /api/public/apply).
  const hiringTeamSeed =
    d.hiringTeam && d.hiringTeam.length > 0
      ? d.hiringTeam
      : [{ userId: user.id, role: "Recruiter (lead)" }];
  // Ensure the lead reviewer is always represented in the hiring team
  // roster, even if the caller submitted a list that excluded them.
  const includesLead = hiringTeamSeed.some((m) => m.userId === user.id);
  if (!includesLead) {
    hiringTeamSeed.push({ userId: user.id, role: "Recruiter (lead)" });
  }

  // Sensible default hiring process — recruiters can fully edit it from the
  // job's Hiring process tab. Stored so it also shows on the public site.
  const processSteps = [
    { n: "Intro chat", who: "Recruiter · 30 min", d: "Get to know each other and the role." },
    { n: "Working session", who: "Hiring manager · 60 min", d: "Walk through a representative problem." },
    { n: "Team meet", who: "2-3 teammates · 60 min", d: "Meet the people you'll work with day to day." },
    { n: "Offer", who: "Decision within a week", d: "We'll move fast once everyone's met." },
  ];

  const job = await db.job.create({
    data: {
      workspaceId: workspace.id,
      slug,
      title: d.title,
      department: d.department,
      location: d.location,
      employment: d.employment,
      pitch: d.pitch,
      description: typeof d.description === "string" ? sanitizeRichText(d.description) : d.description,
      requirements: d.requirements,
      niceToHave: d.niceToHave,
      salaryMin: d.salaryMin ?? null,
      salaryMax: d.salaryMax ?? null,
      // Default the job currency to whatever the workspace is set to so the
      // career site displays consistent symbols across roles.
      salaryCurrency: workspace.currency || "EUR",
      // Job creator = lead reviewer by default. Admins can reassign
      // later via PATCH /api/jobs/[id]. Drives Application.reviewerId
      // defaulting for new applications.
      leadReviewerId: user.id,
      hiringTeam: {
        create: hiringTeamSeed.map((m) => ({ userId: m.userId, role: m.role })),
      },
      screening: d.screeningQuestions ? {
        create: d.screeningQuestions.map((q, i) => ({
          label: q.q,
          required: q.required,
          kind: q.type === "short" ? "text" : q.type === "long" ? "longtext" : "yesno",
          position: i,
        })),
      } : undefined,
      processSteps,
      status: d.publish ? "Open" : "Draft",
      publishedAt: d.publish ? new Date() : null,
      channels: { vellum: d.publish },
    },
  });

  await db.activity.create({
    data: {
      workspaceId: workspace.id,
      kind: "published",
      icon: "Briefcase",
      body: `${job.title} ${d.publish ? "published" : "saved as draft"}`,
      jobId: job.id,
    },
  });

  return NextResponse.json({ id: job.id, slug: job.slug });
}
