// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import JobWizard from "./JobWizard";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const { workspace } = await requireWorkspace();
  const careerSite = await db.careerSite.findUnique({ where: { workspaceId: workspace.id } });

  const departments = (Array.isArray(workspace.departments) ? (workspace.departments as string[]) : []).filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
  const offices = (Array.isArray(careerSite?.offices) ? (careerSite!.offices as { city?: string }[]) : [])
    .map((o) => (o.city || "").trim())
    .filter((c) => c.length > 0);
  // Always include Remote as a synthetic option so distributed roles can pick it.
  const locationOptions = Array.from(new Set([...offices, "Remote"]));
  const currency = workspace.currency || "EUR";

  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <h1>Create a job</h1>
      <p className="muted" style={{ marginTop: 6, marginBottom: 28 }}>
        A few details and you'll be live on the career site.
      </p>
      {departments.length === 0 && (
        <div className="ai-card" style={{ marginBottom: 18 }}>
          <strong>No departments configured yet.</strong>{" "}
          <Link href="/settings?tab=workspace" style={{ color: "var(--accent-solid)" }}>
            Add some in workspace settings
          </Link>{" "}
          so they appear in the dropdown.
        </div>
      )}
      <JobWizard departments={departments} locations={locationOptions} currency={currency} />
    </div>
  );
}
