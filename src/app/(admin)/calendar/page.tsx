// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import CalendarView from "./CalendarView";
import { syncFollowUps } from "@/lib/follow-ups";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const { workspace, user, membership } = await requireWorkspace();

  // Fire-and-forget refresh on page load so the chip strip reflects the
  // latest pipeline state without waiting on the next worker tick. Worker
  // catches up on what we miss here.
  syncFollowUps(workspace.id).catch(() => null);

  const accounts = await db.calendarAccount.findMany({
    where: { workspaceId: workspace.id, userId: user.id },
    select: { id: true, provider: true, email: true, enabled: true, consecutiveErrors: true },
  });

  const cs: any = (workspace as any).calendarSettings || {};
  const settings = {
    workHours: { start: cs.workHours?.start ?? "08:00", end: cs.workHours?.end ?? "19:00" },
    workDays: cs.workDays ?? [1, 2, 3, 4, 5],
    timezone: cs.timezone ?? workspace.timezone ?? "UTC",
    defaultInterviewKind: cs.defaultInterviewKind ?? "video",
  };

  return (
    <CalendarView
      currentUser={{ id: user.id, name: user.name || user.email, role: membership.role }}
      workspace={{ id: workspace.id, name: workspace.name }}
      accounts={accounts}
      settings={settings}
    />
  );
}
