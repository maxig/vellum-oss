// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// /api/recap/purge — admin-only.
//
// Wipes the workspace's RecapCache. Useful after editing thresholds /
// prompts to force the next dashboard load to see a freshly-built recap.
// Also a safety valve when a stale cache row is misbehaving.

import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { purgeRecapCache } from "@/lib/recap";

export async function POST() {
  const { workspace, membership } = await requireWorkspace();
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const count = await purgeRecapCache(workspace.id);
  return NextResponse.json({ ok: true, purged: count });
}
