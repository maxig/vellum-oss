// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { canReadApplication } from "@/lib/permissions";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/applications/[id]/sheet
// Returns everything ProfileSheet needs in one round-trip.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { workspace, user, membership } = await requireWorkspace();
  const { id } = await params;

  // Per-member read gate: this route returns the candidate's resume text,
  // private notes, the full email thread, interviews and ratings — the same
  // rule the resume-file and rating routes enforce. Without it any member
  // could read every candidate across teams (ROLES.md §3.3).
  if (!(await canReadApplication(user.id, id, workspace.id, membership.role))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const app = await db.application.findFirst({
    where: { id, workspaceId: workspace.id },
    include: {
      job: {
        include: {
          screening: { orderBy: { position: "asc" } },
        },
      },
      stage: true,
      candidate: {
        include: {
          notes: { include: { author: true }, orderBy: { createdAt: "desc" } },
          applications: { include: { job: true, stage: true }, orderBy: { appliedAt: "desc" } },
        },
      },
      interviews: {
        orderBy: { scheduledAt: "asc" },
        include: {
          participants: { include: { user: { select: { id: true, name: true, email: true } } } },
          debrief: {
            include: {
              author: { select: { id: true, name: true, email: true } },
              kit: { select: { id: true, name: true } },
            },
          },
        },
      },
      ratings: {
        orderBy: { updatedAt: "desc" },
        include: { author: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  if (!app) return NextResponse.json({ error: "not found" }, { status: 404 });

  const thread = await db.thread.findFirst({
    where: { workspaceId: workspace.id, candidateId: app.candidateId, jobId: app.jobId },
    orderBy: { lastAt: "desc" },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  const activities = await db.activity.findMany({
    where: { workspaceId: workspace.id, candidateId: app.candidateId },
    orderBy: { createdAt: "desc" },
    take: 24,
  });

  // Open-todo count for the drawer's To-dos tab badge (the tab fetches the
  // full list itself so it can refresh on add/toggle without a sheet reload).
  const todosOpen = await db.todo.count({
    where: { workspaceId: workspace.id, candidateId: app.candidateId, done: false },
  });

  return NextResponse.json({
    application: {
      id: app.id,
      jobId: app.jobId,
      jobTitle: app.job.title,
      jobSlug: app.job.slug,
      department: app.job.department,
      location: app.job.location,
      stageId: app.stageId,
      stageKey: app.stage?.key || null,
      stageName: app.stage?.name || "—",
      stageColor: app.stage?.color || "oklch(70% 0.06 250)",
      aiFit: app.aiFit,
      aiSummary: app.aiSummary,
      reviewerId: app.reviewerId,
      resumeUrl: app.resumeUrl,
      resumeName: app.resumeName,
      resumeText: app.resumeText,
      whyUs: app.whyUs,
      screeningQuestions: app.job.screening.map((q) => ({ id: q.id, label: q.label, kind: q.kind })),
      screeningAnswers: normalizeJsonObject(app.screeningAnswers),
      archived: app.archived,
      outcome: app.outcome,
      rejectReason: app.rejectReason,
      appliedAt: app.appliedAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
    },
    candidate: {
      id: app.candidate.id,
      name: app.candidate.name,
      email: app.candidate.email,
      location: app.candidate.location,
      linkedin: app.candidate.linkedin,
      portfolio: app.candidate.portfolio,
      github: app.candidate.github,
      currentRole: app.candidate.currentRole,
      years: app.candidate.years,
      source: app.candidate.source,
      skills: normalizeStringArray(app.candidate.skills),
      createdAt: app.candidate.createdAt.toISOString(),
    },
    otherApplications: app.candidate.applications
      .filter((a) => a.id !== app.id)
      .map((a) => ({
        id: a.id,
        jobId: a.jobId,
        jobTitle: a.job.title,
        stageName: a.stage?.name || "—",
        stageColor: a.stage?.color || "oklch(70% 0.06 250)",
        appliedAt: a.appliedAt.toISOString(),
        archived: a.archived,
      })),
    interviews: app.interviews.map((iv) => ({
      id: iv.id,
      kind: iv.kind,
      scheduledAt: iv.scheduledAt.toISOString(),
      durationMin: iv.durationMin,
      agenda: iv.agenda,
      meetingUrl: iv.meetingUrl,
      location: iv.location,
      interviewers: iv.participants.map((p) => ({
        id: p.user.id,
        name: p.user.name || p.user.email,
      })),
      debrief: iv.debrief
        ? {
            id: iv.debrief.id,
            pros: iv.debrief.pros,
            cons: iv.debrief.cons,
            sentiment: iv.debrief.sentiment,
            rating: iv.debrief.rating,
            recommend: iv.debrief.recommend,
            kitId: iv.debrief.kitId,
            kitName: iv.debrief.kit?.name || null,
            criteria: normalizeCriteria(iv.debrief.criteria),
            authorId: iv.debrief.authorId,
            authorName: iv.debrief.author.name || iv.debrief.author.email,
            updatedAt: iv.debrief.updatedAt.toISOString(),
          }
        : null,
      status: iv.status,
    })),
    ratings: app.ratings.map((r) => ({
      id: r.id,
      authorId: r.authorId,
      authorName: r.author.name || r.author.email,
      score: r.score,
      comment: r.comment,
      updatedAt: r.updatedAt.toISOString(),
    })),
    notes: app.candidate.notes.map((n) => ({
      id: n.id,
      body: n.body,
      author: n.author.name || n.author.email,
      createdAt: n.createdAt.toISOString(),
    })),
    thread: thread
      ? {
          id: thread.id,
          subject: thread.subject,
          messages: thread.messages.map((m) => ({
            id: m.id,
            direction: m.direction,
            body: m.body,
            fromName: m.fromName,
            createdAt: m.createdAt.toISOString(),
          })),
        }
      : null,
    activity: activities.map((a) => ({
      id: a.id,
      kind: a.kind,
      body: a.body,
      icon: a.icon,
      actorName: a.actorName,
      createdAt: a.createdAt.toISOString(),
    })),
    todosOpen,
  });
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeJsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

// InterviewDebrief.criteria — the snapshotted per-criterion answers.
// Shape: [{ itemId, label, kind, score?, text?, yesno? }]. Kept loose;
// the client renders defensively.
function normalizeCriteria(value: unknown) {
  if (!Array.isArray(value)) return [] as Record<string, unknown>[];
  return value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v));
}
