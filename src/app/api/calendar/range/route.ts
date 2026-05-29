// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { buildCalendarRange, type Scope } from "@/lib/calendar-events";

export async function GET(req: Request) {
  const { workspace, user, membership } = await requireWorkspace();
  const url = new URL(req.url);
  const from = parseDate(url.searchParams.get("from")) || new Date();
  const to = parseDate(url.searchParams.get("to")) || new Date(Date.now() + 14 * 86_400_000);
  const scope = (url.searchParams.get("scope") || "mine") as Scope;
  const types = (url.searchParams.get("types") || "").split(",").filter(Boolean) as any[];

  const events = await buildCalendarRange({
    workspaceId: workspace.id,
    userId: user.id,
    role: membership.role,
    from,
    to,
    scope,
    includeTypes: types.length > 0 ? types : undefined,
  });

  return NextResponse.json({ events });
}

function parseDate(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
