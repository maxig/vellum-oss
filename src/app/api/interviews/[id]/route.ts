// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { sanitizeRichText } from "@/lib/sanitize";

const Patch = z.object({
  scheduledAt: z.string().optional(),
  durationMin: z.number().int().min(15).max(480).optional(),
  agenda: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  meetingUrl: z.string().optional().nullable(),
  status: z.enum(["scheduled", "done", "cancelled", "no_show"]).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { workspace, user } = await requireWorkspace();
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const iv = await db.interview.findFirst({
    where: { id, workspaceId: workspace.id },
    include: {
      application: { include: { candidate: true } },
      debrief: { select: { id: true } },
    },
  });
  if (!iv) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Guard against rescheduling a concluded interview. Three independent
  // signals can mark an interview as "done with":
  //   1. status flipped to done / cancelled / no_show
  //   2. a debrief was captured (interviewer wrote feedback)
  //   3. the end time is already in the past
  // Any one is enough to refuse a scheduledAt change — moving a concluded
  // interview rewrites history (debriefs, activity, Pulse signals all hang
  // off the old time). The recruiter should create a follow-up interview
  // instead. The status field itself is still editable on this PATCH so
  // *correcting* the status (e.g. marking done) keeps working.
  if (parsed.data.scheduledAt) {
    const endsAt = new Date(iv.scheduledAt.getTime() + (iv.durationMin || 45) * 60_000);
    const reasons: string[] = [];
    if (iv.status === "done") reasons.push("marked done");
    if (iv.status === "cancelled") reasons.push("cancelled");
    if (iv.status === "no_show") reasons.push("flagged as no-show");
    if (iv.debrief) reasons.push("a debrief is already recorded");
    if (endsAt.getTime() <= Date.now()) reasons.push("it has already happened");
    if (reasons.length > 0) {
      return NextResponse.json(
        {
          error: `This interview can't be rescheduled — ${reasons.join(", ")}. Schedule a new interview instead.`,
          code: "concluded",
        },
        { status: 409 },
      );
    }
  }

  const data: any = {};
  if (parsed.data.scheduledAt) data.scheduledAt = new Date(parsed.data.scheduledAt);
  if (parsed.data.durationMin) data.durationMin = parsed.data.durationMin;
  if (parsed.data.agenda !== undefined)
    data.agenda = parsed.data.agenda ? sanitizeRichText(parsed.data.agenda) : null;
  if (parsed.data.location !== undefined) data.location = parsed.data.location;
  if (parsed.data.meetingUrl !== undefined) data.meetingUrl = parsed.data.meetingUrl;
  if (parsed.data.status) data.status = parsed.data.status;

  await db.interview.update({ where: { id }, data });

  // Sync external calendars.
  if (parsed.data.status === "cancelled") {
    if (iv.externalAccountId && iv.externalEventId) {
      await db.calendarSyncJob.create({
        data: {
          accountId: iv.externalAccountId,
          kind: "cancel",
          payload: { externalEventId: iv.externalEventId },
        },
      });
    }
  } else if (iv.externalAccountId && iv.externalEventId) {
    await db.calendarSyncJob.create({
      data: { accountId: iv.externalAccountId, kind: "patch", payload: { interviewId: id } },
    });
  } else {
    // First sync — find any participant + recruiter accounts and enqueue push jobs.
    const participants = await db.interviewParticipant.findMany({
      where: { interviewId: id },
      select: { userId: true },
    });
    const userIds = Array.from(new Set([...participants.map((p) => p.userId), user.id]));
    const accounts = await db.calendarAccount.findMany({
      where: { userId: { in: userIds }, enabled: true },
      select: { id: true },
    });
    if (accounts.length > 0) {
      await db.calendarSyncJob.createMany({
        data: accounts.map((a) => ({ accountId: a.id, kind: "push", payload: { interviewId: id } })),
      });
    }
  }

  await db.activity.create({
    data: {
      workspaceId: workspace.id,
      actorId: user.id,
      actorName: user.name || user.email,
      kind: parsed.data.status === "cancelled" ? "cancelled" : "scheduled",
      icon: "Calendar",
      body:
        parsed.data.status === "cancelled"
          ? `Interview with ${iv.application.candidate.name} cancelled`
          : `Interview with ${iv.application.candidate.name} updated`,
      candidateId: iv.application.candidateId,
      jobId: iv.application.jobId,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { workspace, user } = await requireWorkspace();
  const { id } = await ctx.params;
  const iv = await db.interview.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { application: { include: { candidate: true } } },
  });
  if (!iv) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Push a cancel to the provider first (best-effort; failure doesn't block deletion).
  if (iv.externalAccountId && iv.externalEventId) {
    await db.calendarSyncJob.create({
      data: {
        accountId: iv.externalAccountId,
        kind: "cancel",
        payload: { externalEventId: iv.externalEventId },
      },
    }).catch(() => null);
  }

  await db.interview.delete({ where: { id } });

  await db.activity.create({
    data: {
      workspaceId: workspace.id,
      actorId: user.id,
      actorName: user.name || user.email,
      kind: "cancelled",
      icon: "Calendar",
      body: `Interview with ${iv.application.candidate.name} deleted`,
      candidateId: iv.application.candidateId,
      jobId: iv.application.jobId,
    },
  });
  return NextResponse.json({ ok: true });
}
