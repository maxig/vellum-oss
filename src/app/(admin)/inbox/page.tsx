// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import InboxView from "./InboxView";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ thread?: string; filter?: string }> }) {
  const { workspace, user } = await requireWorkspace();
  const sp = await searchParams;
  const filter = sp.filter || "all";

  const emailAccount = await db.emailAccount.findUnique({
    where: { workspaceId: workspace.id },
    select: { enabled: true, fromAddress: true },
  });
  const emailEnabled = !!(emailAccount && emailAccount.enabled);

  const threads = await db.thread.findMany({
    where: {
      workspaceId: workspace.id,
      ...(filter === "unread" ? { unread: true } : {}),
      ...(filter === "starred" ? { starred: true } : {}),
    },
    orderBy: { lastAt: "desc" },
    include: {
      candidate: true,
      job: { select: { id: true, title: true } },
      messages: { take: 1, orderBy: { createdAt: "desc" } },
    },
  });

  const activeId = sp.thread || threads[0]?.id || null;
  const active = activeId
    ? await db.thread.findFirst({
        where: { id: activeId, workspaceId: workspace.id },
        include: {
          candidate: true,
          job: { select: { id: true, title: true } },
          messages: { orderBy: { createdAt: "asc" }, include: { fromUser: true } },
        },
      })
    : null;

  // Look up the canonical Application for the active thread so "Open profile"
  // can route the ProfileSheet modal directly without a second round-trip.
  let activeApplicationId: string | null = null;
  if (active) {
    const app = await db.application.findFirst({
      where: {
        workspaceId: workspace.id,
        candidateId: active.candidate.id,
        ...(active.jobId ? { jobId: active.jobId } : {}),
      },
      orderBy: { appliedAt: "desc" },
      select: { id: true },
    });
    activeApplicationId = app?.id || null;
  }

  const stages = await db.stage.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { position: "asc" },
  });

  let activeStage: { name: string; color: string } | null = null;
  if (active) {
    const app = await db.application.findFirst({
      where: { workspaceId: workspace.id, candidateId: active.candidate.id },
      orderBy: { appliedAt: "desc" },
      include: { stage: true },
    });
    if (app?.stage) activeStage = { name: app.stage.name, color: app.stage.color };
  }

  if (active?.unread) {
    await db.thread.update({ where: { id: active.id }, data: { unread: false } });
  }

  return (
    <InboxView
      currentUser={{ id: user.id, name: user.name || user.email }}
      threads={threads.map((t) => ({
        id: t.id,
        subject: t.subject,
        candidate: { id: t.candidate.id, name: t.candidate.name },
        jobTitle: t.job?.title || null,
        starred: t.starred,
        unread: t.unread,
        lastAt: t.lastAt.toISOString(),
        preview: t.messages[0]?.body.slice(0, 160) || "",
        lastDirection: (t.messages[0]?.direction as "in" | "out" | "system") || "system",
      }))}
      activeId={active?.id || null}
      active={
        active && {
          id: active.id,
          subject: active.subject,
          candidateId: active.candidate.id,
          candidateName: active.candidate.name,
          candidateEmail: active.candidate.email,
          jobTitle: active.job?.title || null,
          stage: activeStage,
          starred: active.starred,
          applicationId: activeApplicationId,
          messages: active.messages.map((m) => ({
            id: m.id,
            direction: m.direction as "in" | "out" | "system",
            body: m.body,
            from: m.fromUser?.name || m.fromName || (m.direction === "in" ? active.candidate.name : null),
            createdAt: m.createdAt.toISOString(),
          })),
        }
      }
      filter={filter}
      emailEnabled={emailEnabled}
      fromAddress={emailAccount?.fromAddress || null}
      stages={stages.map((s) => ({ id: s.id, key: s.key, name: s.name, color: s.color }))}
    />
  );
}
