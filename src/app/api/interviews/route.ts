// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { sanitizeRichText, stripHtml } from "@/lib/sanitize";
import { sendInterviewInvite } from "@/lib/email";

const KIND_LABELS: Record<string, string> = {
  phone: "Phone screen",
  video: "Video call",
  onsite: "On-site interview",
  panel: "Panel interview",
};

const Body = z.object({
  applicationId: z.string().min(1),
  kind: z.string().default("video"),
  scheduledAt: z.string(),
  durationMin: z.number().int().min(15).max(480).default(45),
  agenda: z.string().optional(),
  location: z.string().optional().nullable(),
  meetingUrl: z.string().optional().nullable(),
  // List of workspace user IDs to assign as interviewers. Replaces the
  // previous JSON-of-strings shape — each user gets read access to the
  // candidate's profile + can write the debrief afterward, regardless
  // of whether they're on the job's hiring team.
  interviewerIds: z.array(z.string()).optional(),
  // If false the recruiter wants to save the meeting as a draft — no email,
  // no calendar invite. Defaults to true so the "Send now" toggle behaves
  // as expected.
  sendNow: z.boolean().default(true),
});

export async function POST(req: Request) {
  const { workspace, user } = await requireWorkspace();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const app = await db.application.findFirst({
    where: { id: parsed.data.applicationId, workspaceId: workspace.id },
    include: { candidate: true, job: true },
  });
  if (!app) return NextResponse.json({ error: "not found" }, { status: 404 });

  const scheduledAt = new Date(parsed.data.scheduledAt);
  const cleanAgenda = parsed.data.agenda ? sanitizeRichText(parsed.data.agenda) : parsed.data.agenda;
  const kindLabel = KIND_LABELS[parsed.data.kind] || parsed.data.kind;

  // Filter to valid workspace members so a bogus userId can't slip in.
  // De-duplicate too — if the picker lets the same user be selected twice
  // we don't want the unique-index violation.
  let interviewerIds: string[] = [];
  if (parsed.data.interviewerIds && parsed.data.interviewerIds.length > 0) {
    const members = await db.membership.findMany({
      where: { workspaceId: workspace.id, userId: { in: parsed.data.interviewerIds } },
      select: { userId: true },
    });
    interviewerIds = Array.from(new Set(members.map((m) => m.userId)));
  }

  const iv = await db.interview.create({
    data: {
      workspaceId: workspace.id,
      applicationId: app.id,
      kind: parsed.data.kind,
      scheduledAt,
      durationMin: parsed.data.durationMin,
      agenda: cleanAgenda,
      location: parsed.data.location || null,
      meetingUrl: parsed.data.meetingUrl || null,
      participants: {
        create: interviewerIds.map((userId) => ({ userId })),
      },
    },
  });

  await db.activity
    .create({
      data: {
        workspaceId: workspace.id,
        actorId: user.id,
        actorName: user.name || user.email,
        kind: "scheduled",
        icon: "Calendar",
        body: `Interview with ${app.candidate.name} · ${scheduledAt.toLocaleDateString()}`,
        candidateId: app.candidateId,
        jobId: app.jobId,
      },
    })
    .catch(() => null);

  // ── Calendar invite + email ──────────────────────────────────────────────
  // Honour both the per-action "Send now" toggle and the workspace-level
  // master switch. If SMTP isn't configured the helper returns null and we
  // silently fall back to a calendar-only schedule.
  let invite: { sent: boolean; error?: string } = { sent: false };
  const wsDefaults = (workspace as any).defaults as Record<string, boolean> | null;
  const sendInvitesGlobally = !wsDefaults || wsDefaults.sendInterviewInvites !== false;

  if (parsed.data.sendNow && sendInvitesGlobally && app.candidate.email) {
    try {
      // Look up interviewer name+email by their user IDs for the
      // candidate-facing email template.
      const intvUsers =
        interviewerIds.length > 0
          ? await db.user.findMany({
              where: { id: { in: interviewerIds } },
              select: { name: true, email: true },
            })
          : [];
      const res = await sendInterviewInvite(workspace.id, {
        to: app.candidate.email,
        candidateName: app.candidate.name,
        jobTitle: app.job.title,
        interviewId: iv.id,
        kindLabel,
        scheduledAt,
        durationMin: parsed.data.durationMin,
        interviewers: intvUsers.map((u) => ({ name: u.name || u.email, email: u.email })),
        agenda: cleanAgenda ? stripHtml(cleanAgenda) : null,
        location: parsed.data.location || null,
        meetingUrl: parsed.data.meetingUrl || null,
      });
      if (res) {
        invite = { sent: true };
        // Append a system row to the candidate's most-recent thread so the
        // inbox shows that we sent the invite (and so future replies thread
        // via the In-Reply-To matcher).
        const thread = await db.thread.findFirst({
          where: { workspaceId: workspace.id, candidateId: app.candidateId, jobId: app.jobId },
          orderBy: { lastAt: "desc" },
        });
        const targetThread = thread
          ? thread
          : await db.thread.create({
              data: {
                workspaceId: workspace.id,
                candidateId: app.candidateId,
                jobId: app.jobId,
                subject: `${app.job.title} — interview scheduled`,
                lastAt: new Date(),
              },
            });
        await db.message.create({
          data: {
            threadId: targetThread.id,
            direction: "out",
            body: `Interview invite sent — ${kindLabel} on ${scheduledAt.toLocaleString()} (${parsed.data.durationMin} min).`,
            fromUserId: user.id,
            fromName: user.name || user.email,
            externalMessageId: res.messageId || null,
          },
        });
        await db.thread.update({ where: { id: targetThread.id }, data: { lastAt: new Date() } });
      }
    } catch (e) {
      const msg = (e as Error).message || "unknown SMTP error";
      console.warn("[interviews] invite email failed:", msg);
      invite = { sent: false, error: msg };
    }
  }

  // ── External calendar push ──────────────────────────────────────────────
  // Enqueue a push job for each interview participant that has a connected
  // calendar account. The sync worker drains the queue and persists
  // externalEventId on the Interview row.
  if (interviewerIds.length > 0) {
    const accounts = await db.calendarAccount.findMany({
      where: { userId: { in: interviewerIds }, enabled: true },
      select: { id: true },
    });
    if (accounts.length > 0) {
      await db.calendarSyncJob.createMany({
        data: accounts.map((a) => ({
          accountId: a.id,
          kind: "push",
          payload: { interviewId: iv.id },
        })),
      });
    }
  }
  // Also push to the recruiter's own calendars if they're not in the participants.
  if (!interviewerIds.includes(user.id)) {
    const myAccounts = await db.calendarAccount.findMany({
      where: { userId: user.id, enabled: true },
      select: { id: true },
    });
    if (myAccounts.length > 0) {
      await db.calendarSyncJob.createMany({
        data: myAccounts.map((a) => ({
          accountId: a.id,
          kind: "push",
          payload: { interviewId: iv.id },
        })),
      });
    }
  }

  return NextResponse.json({ id: iv.id, invite });
}
