// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { revokeToken } from "@/lib/google-calendar";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { workspace, user } = await requireWorkspace();
  const { id } = await ctx.params;
  const account = await db.calendarAccount.findFirst({
    where: { id, workspaceId: workspace.id, userId: user.id },
  });
  if (!account) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (account.provider === "google") {
    await revokeToken(id);
  }
  // CalDAV: nothing to revoke server-side. Microsoft: no public revoke
  // endpoint that works on personal accounts; MSAL cache eviction is
  // implicit when the account row is gone.

  await db.calendarAccount.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
