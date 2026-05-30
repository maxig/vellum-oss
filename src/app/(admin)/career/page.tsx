// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { publicScheme } from "@/lib/app-host";
import { Glass, Chip, Icons } from "@/components/primitives";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CareerPreviewPage() {
  const { workspace } = await requireWorkspace();
  const [jobs, careerSite] = await Promise.all([
    db.job.findMany({ where: { workspaceId: workspace.id, status: "Open" }, orderBy: { publishedAt: "desc" } }),
    db.careerSite.findUnique({ where: { workspaceId: workspace.id } }),
  ]);
  const apex = process.env.PUBLIC_DOMAIN || "localhost:3000";
  const publicUrl = `${publicScheme()}://${workspace.slug}.${apex}`;
  const customDomain = careerSite?.customDomain || null;
  const verified = !!careerSite?.verifiedAt;
  const displayDomain = customDomain || `${workspace.slug}.${apex}`;

  return (
    <div className="page">
      {/* Preview banner — matches the original design's PreviewBanner */}
      <Glass faint className="career-preview-banner">
        <Icons.Globe size={12} />
        <span>
          You're previewing your career site at{" "}
          <b className="mono" style={{ color: "var(--ink-1)" }}>{displayDomain}</b>
        </span>
        {customDomain && (
          <span
            className="chip"
            style={{
              marginLeft: 8, fontSize: 10.5, height: 18, padding: "0 6px",
              background: verified
                ? "color-mix(in oklab, oklch(68% 0.16 150) 16%, transparent)"
                : "color-mix(in oklab, oklch(70% 0.15 60) 16%, transparent)",
              color: verified ? "oklch(45% 0.16 150)" : "oklch(50% 0.15 60)",
              borderColor: "transparent",
            }}
          >
            <span className="chip-dot" /> {verified ? "CNAME live" : "CNAME pending"}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Link href="/settings?tab=career" className="btn btn-sm btn-ghost">
          <Icons.Settings size={12} /> Edit content
        </Link>
        <a href={publicUrl} target="_blank" rel="noreferrer" className="btn btn-sm">
          <Icons.ArrowUpRight size={11} /> Open as visitor
        </a>
      </Glass>

      <Glass className="career-preview-frame">
        <iframe
          src={publicUrl}
          title={`${workspace.name} career site preview`}
          style={{ width: "100%", height: 920, border: 0, background: "white", display: "block" }}
        />
      </Glass>

      <Glass className="card" style={{ padding: 24, marginTop: 14 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Live job pages</h2>
        {jobs.length === 0 && <div className="muted">No open jobs to preview.</div>}
        {jobs.map((j) => (
          <div key={j.id} className="row" style={{ padding: "10px 0", borderBottom: "0.5px solid var(--line)" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{j.title}</div>
              <a className="tiny mono" href={`${publicUrl}/jobs/${j.slug}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent-solid)" }}>
                {publicUrl}/jobs/{j.slug}
              </a>
            </div>
            <Chip good dot>Open</Chip>
          </div>
        ))}
      </Glass>
    </div>
  );
}
