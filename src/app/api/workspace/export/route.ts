// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { requireWorkspace, isAdmin } from "@/lib/workspace";
import { db } from "@/lib/db";

export async function GET() {
  // Bulk export dumps the whole workspace — full candidate PII across jobs,
  // threads, messages, notes, and interviews. Admin/owner-only per ROLES.md §5.
  const { workspace, membership } = await requireWorkspace();
  if (!isAdmin(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const [jobs, candidates, applications, threads, messages, notes, interviews, careerSite] = await Promise.all([
    db.job.findMany({ where: { workspaceId: workspace.id } }),
    db.candidate.findMany({ where: { workspaceId: workspace.id } }),
    db.application.findMany({ where: { workspaceId: workspace.id } }),
    db.thread.findMany({ where: { workspaceId: workspace.id } }),
    db.message.findMany({ where: { thread: { workspaceId: workspace.id } } }),
    db.note.findMany({ where: { workspaceId: workspace.id } }),
    db.interview.findMany({ where: { workspaceId: workspace.id } }),
    db.careerSite.findUnique({ where: { workspaceId: workspace.id } }),
  ]);
  return new NextResponse(JSON.stringify({ workspace, jobs, candidates, applications, threads, messages, notes, interviews, careerSite }, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="vellum-${workspace.slug}-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
