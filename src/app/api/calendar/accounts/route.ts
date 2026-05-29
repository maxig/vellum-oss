// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { googleConfigured } from "@/lib/google-calendar";
import { microsoftConfigured } from "@/lib/microsoft-calendar";

export async function GET() {
  const { workspace, user } = await requireWorkspace();
  const accounts = await db.calendarAccount.findMany({
    where: { workspaceId: workspace.id, userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    accounts: accounts.map((a) => ({
      id: a.id,
      provider: a.provider,
      email: a.email,
      displayName: a.displayName,
      enabled: a.enabled,
      lastPolledAt: a.lastPolledAt?.toISOString() || null,
      lastError: a.lastError,
      consecutiveErrors: a.consecutiveErrors,
      defaultCalendarUrl: a.defaultCalendarUrl,
      serverUrl: a.serverUrl,
      createdAt: a.createdAt.toISOString(),
    })),
    providers: {
      google: { configured: googleConfigured() },
      microsoft: { configured: microsoftConfigured() },
      caldav: { configured: true }, // CalDAV always available
    },
  });
}
