// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Follow-up generator.
 *
 * Computes the 6 deterministic FollowUp kinds catalogued in
 * CALENDAR_FEATURE.md §5 and upserts FollowUp rows. Pure DB reads,
 * pure upserts — same shape as the review-queue worker so the two can
 * coexist without stepping on each other.
 *
 * Per-(user, application, kind) is unique (see Prisma model), so this
 * is safe to call repeatedly: a follow-up that's already there just
 * gets its `dueAt` and `reason` refreshed.
 */

import { db } from "@/lib/db";

export type FollowUpKind =
  | "reply"
  | "decide"
  | "send_rejection"
  | "debrief"
  | "reference"
  | "nudge_offer"
  | "ai_suggested";

type Slas = {
  replyHours: number;
  decideHours: number;
  rejectionHours: number;
  debriefHours: number;
  offerNudgeDays: number;
  referenceSlaDays: number;
};

function defaultSlas(): Slas {
  return {
    replyHours: 24,
    decideHours: 48,
    rejectionHours: 24,
    debriefHours: 4,
    offerNudgeDays: 3,
    referenceSlaDays: 5,
  };
}

async function loadSlas(workspaceId: string): Promise<Slas> {
  const cfg = await db.aIConfig.findUnique({ where: { workspaceId } });
  const d = defaultSlas();
  if (!cfg) return d;
  return {
    replyHours: cfg.followupReplyHours ?? d.replyHours,
    decideHours: cfg.followupDecideHours ?? d.decideHours,
    rejectionHours: cfg.followupRejectionHours ?? d.rejectionHours,
    debriefHours: cfg.followupDebriefHours ?? d.debriefHours,
    offerNudgeDays: cfg.followupOfferNudgeDays ?? d.offerNudgeDays,
    referenceSlaDays: cfg.followupReferenceSlaDays ?? d.referenceSlaDays,
  };
}

function addHours(d: Date, h: number): Date {
  return new Date(d.getTime() + h * 3_600_000);
}
function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

type FollowUpCandidate = {
  userId: string;
  applicationId: string;
  candidateId: string;
  kind: FollowUpKind;
  dueAt: Date;
  reason: string;
  source?: "rule" | "ai";
};

/**
 * Build the catalog of follow-ups for a single workspace. Returns the
 * canonical set; the caller decides whether to upsert or just inspect.
 */
export async function computeFollowUps(workspaceId: string): Promise<FollowUpCandidate[]> {
  const slas = await loadSlas(workspaceId);

  const apps = await db.application.findMany({
    where: { workspaceId, archived: false },
    include: {
      candidate: {
        select: {
          id: true,
          name: true,
          threads: {
            select: {
              id: true,
              jobId: true,
              lastAt: true,
              messages: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { direction: true, createdAt: true },
              },
            },
            orderBy: { lastAt: "desc" },
            take: 5,
          },
        },
      },
      job: { select: { id: true, leadReviewerId: true, hiringTeam: { select: { userId: true } } } },
      stage: { select: { key: true } },
      interviews: {
        select: {
          id: true,
          scheduledAt: true,
          durationMin: true,
          status: true,
          participants: { select: { userId: true } },
          debrief: { select: { id: true } },
        },
      },
    },
  });

  const out: FollowUpCandidate[] = [];
  const now = new Date();

  for (const app of apps) {
    const ownerId = app.reviewerId ?? app.job.leadReviewerId ?? null;
    if (!ownerId) continue; // no recruiter → no one to nudge

    const stageKey = app.stage?.key;
    const isTerminalStage = stageKey === "hired" || stageKey === "rejected";

    // Find the thread most relevant to this application — prefer one
    // tagged with the same jobId, fall back to the candidate's most-recent.
    const candidateThreads = app.candidate.threads || [];
    const thread =
      candidateThreads.find((t) => t.jobId === app.jobId) ||
      candidateThreads[0];

    // ── 5.1 reply ────────────────────────────────────────────────────
    // Last message on the most recent thread is from the candidate (in)
    // and older than the SLA.
    const last = thread?.messages?.[0];
    if (!isTerminalStage && last?.direction === "in") {
      const ageH = (now.getTime() - last.createdAt.getTime()) / 3_600_000;
      if (ageH >= slas.replyHours) {
        out.push({
          userId: ownerId,
          applicationId: app.id,
          candidateId: app.candidateId,
          kind: "reply",
          dueAt: addHours(last.createdAt, slas.replyHours),
          reason: `${app.candidate.name.split(" ")[0]} replied — waiting on your reply.`,
        });
      }
    }

    // ── 5.4 debrief ──────────────────────────────────────────────────
    // Per-interview: an ended interview with no debrief; owed by each
    // participant (not the recruiter). Multiple participants → one
    // FollowUp row per participant, all sharing the same (application, kind).
    // The unique constraint is (userId, applicationId, kind) so two
    // interviewers can each owe a debrief on the same app.
    for (const iv of app.interviews) {
      const endsAt = new Date(iv.scheduledAt.getTime() + (iv.durationMin || 45) * 60_000);
      if (!iv.debrief && endsAt < now && iv.status !== "cancelled") {
        const dueAt = addHours(endsAt, slas.debriefHours);
        for (const p of iv.participants) {
          out.push({
            userId: p.userId,
            applicationId: app.id,
            candidateId: app.candidateId,
            kind: "debrief",
            dueAt,
            reason: `Debrief due — ${app.candidate.name} interviewed ${endsAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}.`,
          });
        }
      }
    }

    // ── 5.2 decide ───────────────────────────────────────────────────
    // All ended interviews have debriefs, application has no outcome yet.
    const interviews = app.interviews;
    if (
      interviews.length > 0 &&
      !app.outcome &&
      interviews.every(
        (iv) =>
          iv.status === "cancelled" ||
          (new Date(iv.scheduledAt.getTime() + (iv.durationMin || 45) * 60_000) < now && iv.debrief),
      )
    ) {
      const debriefedTimes = interviews
        .filter((iv) => iv.debrief)
        .map((iv) => iv.scheduledAt.getTime());
      if (debriefedTimes.length > 0) {
        const lastDebriefAt = new Date(Math.max(...debriefedTimes));
        out.push({
          userId: ownerId,
          applicationId: app.id,
          candidateId: app.candidateId,
          kind: "decide",
          dueAt: addHours(lastDebriefAt, slas.decideHours),
          reason: `All debriefs in for ${app.candidate.name} — decision needed.`,
        });
      }
    }

    // ── 5.3 send_rejection ───────────────────────────────────────────
    // Outcome=rejected but no candidate-facing message yet (we approximate
    // "rejection thread sent" with: no outbound message after outcomeAt).
    if (app.outcome === "rejected" && app.outcomeAt) {
      const t = thread;
      const sentSinceOutcome = !!t?.messages?.[0] && t.messages[0].direction === "out" && t.messages[0].createdAt >= app.outcomeAt;
      if (!sentSinceOutcome) {
        out.push({
          userId: ownerId,
          applicationId: app.id,
          candidateId: app.candidateId,
          kind: "send_rejection",
          dueAt: addHours(app.outcomeAt, slas.rejectionHours),
          reason: `Rejection email to ${app.candidate.name} hasn't gone out yet.`,
        });
      }
    }

    // ── 5.5 reference ────────────────────────────────────────────────
    // Offer extended, reference checks haven't been completed (we don't
    // model ReferenceCheck yet so we treat "offer extended for ≥ N days
    // with no hired outcome" as the trigger).
    if (app.offerExtendedAt && !app.outcome) {
      const dueAt = addDays(app.offerExtendedAt, slas.referenceSlaDays);
      if (dueAt < addDays(now, 14)) {
        out.push({
          userId: ownerId,
          applicationId: app.id,
          candidateId: app.candidateId,
          kind: "reference",
          dueAt,
          reason: `Reference checks for ${app.candidate.name} are due.`,
        });
      }
    }

    // ── 5.6 nudge_offer ──────────────────────────────────────────────
    // Offer extended N+ days ago without a candidate decision.
    if (app.offerExtendedAt && !app.outcome) {
      const ageDays = (now.getTime() - app.offerExtendedAt.getTime()) / 86_400_000;
      if (ageDays >= slas.offerNudgeDays) {
        out.push({
          userId: ownerId,
          applicationId: app.id,
          candidateId: app.candidateId,
          kind: "nudge_offer",
          dueAt: addDays(app.offerExtendedAt, slas.offerNudgeDays),
          reason: `Offer to ${app.candidate.name} pending for ${Math.floor(ageDays)} day${ageDays >= 2 ? "s" : ""}.`,
        });
      }
    }
  }

  return out;
}

/**
 * Compute + upsert follow-ups for a workspace. Existing active rows
 * that no longer match a current candidate are marked `done` so the
 * calendar view shows the catch-up rather than ghosting them entirely.
 */
export async function syncFollowUps(workspaceId: string): Promise<{ created: number; updated: number; closed: number }> {
  const candidates = await computeFollowUps(workspaceId);

  // Load active AND dismissed rows: active ones drive the stale-close pass,
  // and dismissed ones are needed for the re-activation guard below (done rows
  // are archival, so we leave them out to keep this bounded).
  const existing = await db.followUp.findMany({
    where: { workspaceId, state: { in: ["active", "dismissed"] } },
    select: { id: true, userId: true, applicationId: true, kind: true, state: true, updatedAt: true },
  });

  const key = (a: { userId: string; applicationId: string; kind: string }) => `${a.userId}::${a.applicationId}::${a.kind}`;
  const existingByKey = new Map(existing.map((e) => [key(e), e]));
  const wantedKeys = new Set(candidates.map(key));
  const DISMISS_HOLD_MS = 24 * 60 * 60 * 1000;

  let created = 0;
  let updated = 0;
  for (const c of candidates) {
    // Re-activate a dismissed item only after a 24h hold, so clicking
    // "dismiss" actually sticks for the day instead of the very next sync
    // upserting it straight back to active (the guard the old comment
    // described but never implemented).
    const prev = existingByKey.get(key(c));
    const heldDismissed =
      prev && prev.state === "dismissed" && Date.now() - prev.updatedAt.getTime() < DISMISS_HOLD_MS;

    const res = await db.followUp.upsert({
      where: { userId_applicationId_kind: { userId: c.userId, applicationId: c.applicationId, kind: c.kind } },
      create: {
        workspaceId,
        userId: c.userId,
        applicationId: c.applicationId,
        candidateId: c.candidateId,
        kind: c.kind,
        dueAt: c.dueAt,
        reason: c.reason,
        source: c.source || "rule",
        state: "active",
      },
      update: {
        dueAt: c.dueAt,
        reason: c.reason,
        // Refresh due/reason always; only flip back to active once the hold
        // has elapsed. Within the hold window we leave `state` untouched.
        ...(heldDismissed ? {} : { state: "active" }),
      },
    });
    if (res.createdAt.getTime() === res.updatedAt.getTime()) created += 1;
    else updated += 1;
  }

  // Close out stale rows. We don't delete — keeps audit, lets the UI
  // show "you finished X this week" later. Only active rows are closed;
  // dismissed ones stay dismissed.
  const stale = existing.filter((e) => e.state === "active" && !wantedKeys.has(key(e)));
  if (stale.length > 0) {
    await db.followUp.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { state: "done" },
    });
  }

  return { created, updated, closed: stale.length };
}
