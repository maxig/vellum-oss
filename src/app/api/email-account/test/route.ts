// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { requireWorkspace, isAdmin } from "@/lib/workspace";
import { db } from "@/lib/db";
import { testEmailConnection } from "@/lib/email";

export async function POST() {
  const { workspace, membership } = await requireWorkspace();
  if (!isAdmin(membership.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const acct = await db.emailAccount.findUnique({ where: { workspaceId: workspace.id } });
  if (!acct) return NextResponse.json({ error: "Email not configured" }, { status: 404 });
  const result = await testEmailConnection(acct as any);
  return NextResponse.json(result);
}
