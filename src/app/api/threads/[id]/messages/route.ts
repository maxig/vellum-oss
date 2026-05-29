// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse, after } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { sanitizeRichText, stripHtml } from "@/lib/sanitize";
import { recordSignal } from "@/lib/pulse";
import { classifyAndRecordSentiment } from "@/lib/pulse-sentiment";

const Body = z.object({
  body: z.string().min(1).max(20_000),
  direction: z.enum(["in", "out", "system"]).default("out"),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { workspace, user } = await requireWorkspace();
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const t = await db.thread.findFirst({
    where: { id, workspaceId: workspace.id },
    include: {
      // Pull the candidate's current application stage for the sentiment
      // classifier's context payload — sentiment is interpreted differently
      // for a fresh applicant vs. a verbal-yes-at-offer candidate.
      candidate: {
        include: {
          applications: {
            include: { stage: true },
            orderBy: { appliedAt: "desc" },
            take: 1,
          },
        },
      },
      messages: { orderBy: { createdAt: "desc" }, take: 1, where: { direction: "out" } },
    },
  });
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isHtml = /<\/?[a-z][\s\S]*?>/i.test(parsed.data.body);
  const body = isHtml ? sanitizeRichText(parsed.data.body) : parsed.data.body;

  const m = await db.message.create({
    data: {
      threadId: id,
      direction: parsed.data.direction,
      body,
      fromUserId: parsed.data.direction === "out" ? user.id : null,
      fromName: parsed.data.direction === "out" ? user.name || user.email : null,
    },
  });
  await db.thread.update({ where: { id }, data: { lastAt: new Date(), unread: parsed.data.direction === "in" } });

  // Pulse — record an engagement signal for inbound messages. Outbound is
  // a no-op (sender is the workspace, not the candidate). System messages
  // also don't move Pulse.
  if (parsed.data.direction === "in") {
    const kind = body.length > 240 ? "message_long_reply" : "message_received";
    await recordSignal({
      workspaceId: workspace.id,
      candidateId: t.candidateId,
      kind,
      source: "inbox",
      evidence: { threadId: t.id, messageId: m.id },
    }).catch(() => null); // never block the message write on Pulse

    // Sentiment classification — fires after the response so the user
    // never waits on the LLM call. Idempotent on messageId; gated by the
    // workspace's `pulseSentiment` feature toggle inside the helper.
    const messageBodyText = isHtml ? stripHtml(body) : body;
    const previousOutbound = t.messages[0]?.body;
    const stage = t.candidate.applications[0]?.stage?.key || null;
    after(async () => {
      await classifyAndRecordSentiment({
        workspaceId: workspace.id,
        candidateId: t.candidateId,
        messageId: m.id,
        body: messageBodyText.slice(0, 4000),
        stage,
        previousOutboundExcerpt: previousOutbound
          ? stripHtml(previousOutbound).slice(0, 600)
          : null,
        threadSubject: t.subject,
      }).catch((e) => console.warn("[sentiment] classify failed:", (e as Error).message));
    });
  }

  return NextResponse.json({ id: m.id });
}
