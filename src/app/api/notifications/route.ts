// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// GET /api/notifications — the current user's notifications, newest first,
// with a resolved applicationId per candidate notification so the bell can
// open the candidate drawer directly.

import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const { workspace, user } = await requireWorkspace();

  const notifications = await db.notification.findMany({
    where: { workspaceId: workspace.id, userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  // Resolve an applicationId for each candidate-linked notification in one
  // query. Prefer the application matching the notification's jobId; fall
  // back to the candidate's most recent application.
  const candidateIds = [...new Set(notifications.map((n) => n.candidateId).filter(Boolean) as string[])];
  const apps = candidateIds.length
    ? await db.application.findMany({
        where: { workspaceId: workspace.id, candidateId: { in: candidateIds } },
        orderBy: { appliedAt: "desc" },
        select: { id: true, candidateId: true, jobId: true },
      })
    : [];
  const appFor = (candidateId: string | null, jobId: string | null) => {
    if (!candidateId) return null;
    const forCand = apps.filter((a) => a.candidateId === candidateId);
    const match = (jobId && forCand.find((a) => a.jobId === jobId)) || forCand[0];
    return match?.id ?? null;
  };

  const unread = notifications.filter((n) => !n.read).length;

  return NextResponse.json({
    unread,
    notifications: notifications.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      icon: n.icon,
      read: n.read,
      candidateId: n.candidateId,
      jobId: n.jobId,
      applicationId: appFor(n.candidateId, n.jobId),
      createdAt: n.createdAt.toISOString(),
    })),
  });
}
