// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";

const DAY = 86_400_000;

export async function GET() {
  const { user, workspace } = await requireWorkspace();
  const wid = workspace.id;
  const now = Date.now();
  const thirtyDaysAgo = new Date(now - 30 * DAY);
  const sevenDaysAgo = new Date(now - 7 * DAY);

  // ── Last 30 days ──────────────────────────────────────────────────────
  const [touchedActivity, schedulesLast30, repliesLast30, inboundLast30] = await Promise.all([
    // "Touched" = any activity authored by this user (moved, noted, scheduled,
    // AI runs). We dedupe by candidate to count people, not events.
    db.activity.findMany({
      where: { workspaceId: wid, actorId: user.id, createdAt: { gte: thirtyDaysAgo } },
      select: { candidateId: true },
    }),
    db.activity.count({
      where: { workspaceId: wid, actorId: user.id, kind: "scheduled", createdAt: { gte: thirtyDaysAgo } },
    }),
    // For the reply-within-48h rate: pair every inbound message in the window
    // with the next outbound from this user in the same thread.
    db.message.findMany({
      where: {
        direction: "out",
        fromUserId: user.id,
        createdAt: { gte: thirtyDaysAgo },
        thread: { workspaceId: wid },
      },
      select: { threadId: true, createdAt: true },
    }),
    db.message.findMany({
      where: {
        direction: "in",
        createdAt: { gte: thirtyDaysAgo },
        thread: { workspaceId: wid },
      },
      select: { threadId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const touched = new Set(touchedActivity.map((a) => a.candidateId).filter(Boolean)).size;

  // Group outbound by thread, sorted ascending, so we can binary-search the
  // first outbound after each inbound timestamp.
  const outByThread = new Map<string, number[]>();
  for (const m of repliesLast30) {
    if (!outByThread.has(m.threadId)) outByThread.set(m.threadId, []);
    outByThread.get(m.threadId)!.push(m.createdAt.getTime());
  }
  for (const arr of outByThread.values()) arr.sort((a, b) => a - b);

  let inboundCount = 0;
  let within48h = 0;
  for (const m of inboundLast30) {
    inboundCount += 1;
    const outs = outByThread.get(m.threadId);
    if (!outs) continue;
    const t = m.createdAt.getTime();
    const next = outs.find((o) => o > t);
    if (next != null && next - t <= 48 * 3600 * 1000) within48h += 1;
  }
  const replyRate = inboundCount > 0 ? Math.round((within48h / inboundCount) * 100) : null;

  // ── This week ─────────────────────────────────────────────────────────
  const [
    interviewsThisWeek,
    repliesThisWeek,
    moves,
    offersAccepted,
  ] = await Promise.all([
    db.activity.count({
      where: { workspaceId: wid, actorId: user.id, kind: "scheduled", createdAt: { gte: sevenDaysAgo } },
    }),
    db.message.findMany({
      where: {
        direction: "out",
        fromUserId: user.id,
        createdAt: { gte: sevenDaysAgo },
        thread: { workspaceId: wid },
      },
      select: { id: true, threadId: true, createdAt: true },
    }),
    db.activity.findMany({
      where: { workspaceId: wid, actorId: user.id, kind: "moved", createdAt: { gte: sevenDaysAgo } },
      select: { body: true },
    }),
    db.application.findMany({
      where: {
        workspaceId: wid,
        stage: { key: "hired" },
        updatedAt: { gte: sevenDaysAgo },
      },
      include: { candidate: { select: { name: true } }, job: { select: { title: true } } },
      take: 1,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const forwardMoves = moves.filter((m) => !/→\s*(rejected|archived)/i.test(m.body)).length;
  const archiveMoves = moves.length - forwardMoves;

  // Median response time across this week's outbound replies.
  const deltas: number[] = [];
  for (const r of repliesThisWeek) {
    // Most recent inbound in the same thread before this reply.
    const inbound = await db.message.findFirst({
      where: {
        threadId: r.threadId,
        direction: "in",
        createdAt: { lt: r.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (inbound) deltas.push(r.createdAt.getTime() - inbound.createdAt.getTime());
  }
  deltas.sort((a, b) => a - b);
  const medianMs = deltas.length ? deltas[Math.floor(deltas.length / 2)] : null;

  const featuredOffer = offersAccepted[0]
    ? { candidate: offersAccepted[0].candidate.name, job: offersAccepted[0].job.title }
    : null;

  return NextResponse.json({
    last30: {
      candidatesTouched: touched,
      interviewsScheduled: schedulesLast30,
      replyWithin48hPct: replyRate, // null if no inbound messages in window
      replyDenominator: inboundCount,
    },
    thisWeek: {
      interviewsScheduled: interviewsThisWeek,
      repliesSent: repliesThisWeek.length,
      medianReplyHours: medianMs != null ? Math.round(medianMs / 3600_000) : null,
      stageMoves: moves.length,
      stageMovesForward: forwardMoves,
      stageMovesArchive: archiveMoves,
      offerAccepted: featuredOffer,
    },
  });
}
