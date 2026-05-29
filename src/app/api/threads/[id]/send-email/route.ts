// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { sendOutboundEmail } from "@/lib/email";
import { emailToText, sanitizeRichText } from "@/lib/sanitize";

const Body = z.object({
  body: z.string().min(1).max(20_000),
  subject: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { workspace, user } = await requireWorkspace();
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const thread = await db.thread.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { candidate: true, messages: { orderBy: { createdAt: "asc" }, take: 50 } },
  });
  if (!thread) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!thread.candidate.email) {
    return NextResponse.json({ error: "Candidate has no email on file." }, { status: 400 });
  }

  const acct = await db.emailAccount.findUnique({ where: { workspaceId: workspace.id } });
  if (!acct || !acct.enabled) {
    return NextResponse.json({ error: "Email is not configured for this workspace." }, { status: 412 });
  }

  // Build References / In-Reply-To from prior external message ids so the
  // candidate's mail client threads our reply correctly.
  const externalIds = thread.messages
    .map((m) => m.externalMessageId)
    .filter((x): x is string => !!x);
  const inReplyTo = externalIds[externalIds.length - 1];

  // Reply composers now emit HTML from the Wysiwyg editor. Plain-text input
  // (e.g. early callers) is still accepted — we treat it as text only.
  const incoming = parsed.data.body;
  const isHtml = /<\/?[a-z][\s\S]*?>/i.test(incoming);
  const html = isHtml ? sanitizeRichText(incoming) : null;
  const text = isHtml ? emailToText(incoming) : incoming;
  const storedBody = html ?? text;

  let sent;
  try {
    sent = await sendOutboundEmail(workspace.id, {
      to: thread.candidate.email,
      subject: parsed.data.subject || thread.subject || "Hello from " + workspace.name,
      text,
      html: html || undefined,
      inReplyTo,
      references: externalIds,
    });
  } catch (e) {
    const msg = (e as Error).message || "unknown error";
    console.error("[send-email]", msg);
    // Persist so the recruiter sees it in Settings → Email "Last error".
    await db.emailAccount
      .updateMany({
        where: { workspaceId: workspace.id },
        data: { lastError: msg.slice(0, 800) },
      })
      .catch(() => {});
    return NextResponse.json({ error: `SMTP failed: ${msg}` }, { status: 502 });
  }

  const msg = await db.message.create({
    data: {
      threadId: id,
      direction: "out",
      body: storedBody,
      fromUserId: user.id,
      fromName: user.name || user.email,
      externalMessageId: sent.messageId || null,
    },
  });
  await db.thread.update({ where: { id }, data: { lastAt: new Date(), unread: false } });

  return NextResponse.json({ id: msg.id, messageId: sent.messageId });
}
