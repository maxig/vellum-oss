// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import JobsList, { type JobRow } from "./JobsList";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const { workspace } = await requireWorkspace();

  const jobs = await db.job.findMany({
    where: { workspaceId: workspace.id },
    include: {
      _count: { select: { applications: true } },
      applications: { select: { appliedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Build the rows the table renders. Server-side aggregation keeps the
  // client bundle small and lets us derive "X new this week" + "days open"
  // without shipping every Application timestamp to the browser.
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 86_400_000;

  const rows: JobRow[] = jobs.map((j) => {
    const newThisWeek = j.applications.filter((a) => a.appliedAt.getTime() >= sevenDaysAgo).length;
    const startedAt = (j.publishedAt || j.createdAt).getTime();
    const daysOpen = Math.max(0, Math.round((now - startedAt) / 86_400_000));
    return {
      id: j.id,
      title: j.title,
      department: j.department || "",
      location: j.location || "",
      applicants: j._count.applications,
      newThisWeek,
      daysOpen,
      status: j.status,
      published: !!j.publishedAt,
    };
  });

  return <JobsList rows={rows} />;
}
