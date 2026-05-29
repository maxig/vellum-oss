// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { readBusyWindows } from "@/lib/calendar-events";

export async function GET(req: Request) {
  const { workspace, user } = await requireWorkspace();
  const url = new URL(req.url);
  const from = parseDate(url.searchParams.get("from")) || new Date();
  const to = parseDate(url.searchParams.get("to")) || new Date(Date.now() + 14 * 86_400_000);

  const busy = await readBusyWindows({
    workspaceId: workspace.id,
    userId: user.id,
    from,
    to,
  });

  return NextResponse.json({ busy });
}

function parseDate(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
