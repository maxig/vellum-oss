// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Glass, Icons, WorkspaceMark } from "@/components/primitives";
import ApplyForm from "./ApplyForm";
import { recordCareerEvent } from "@/lib/career-events";

export const dynamic = "force-dynamic";

export default async function ApplyPage({ params, searchParams }: { params: Promise<{ workspace: string; slug: string }>; searchParams: Promise<{ done?: string }> }) {
  const p = await params;
  const sp = await searchParams;
  const ws = await db.workspace.findUnique({ where: { slug: p.workspace } });
  if (!ws) notFound();
  const job = await db.job.findFirst({
    where: { workspaceId: ws.id, slug: p.slug, status: "Open" },
    include: { screening: { orderBy: { position: "asc" } } },
  });
  if (!job) notFound();

  // Track form interactions for `apply_dropoff`. `form_start` fires on
  // page render; `apply_complete` fires when the thank-you screen renders.
  if (sp.done) {
    await recordCareerEvent({
      workspaceId: ws.id,
      kind: "apply_complete",
      jobId: job.id,
      path: `/careers/${p.workspace}/jobs/${p.slug}/apply`,
    });
  } else {
    await recordCareerEvent({
      workspaceId: ws.id,
      kind: "form_start",
      jobId: job.id,
      path: `/careers/${p.workspace}/jobs/${p.slug}/apply`,
    });
  }

  if (sp.done) {
    return (
      <>
        <Glass className="career-nav glass-strong">
          <WorkspaceMark workspace={{ name: ws.name, color: ws.color }} />
          <div style={{ fontWeight: 600, fontSize: 17 }}>{ws.name}</div>
        </Glass>
        <section style={{ maxWidth: 720, margin: "80px auto", padding: "0 32px", textAlign: "center" }}>
          <Glass className="card" style={{ padding: 56 }}>
            <Icons.Check size={32} stroke={2.2} style={{ color: "var(--accent-solid)" }} />
            <h1 style={{ marginTop: 14 }}>Thanks for applying.</h1>
            <p style={{ marginTop: 14, fontSize: 16, lineHeight: 1.55 }}>
              We've received your application for <b>{job.title}</b>. Someone on the {ws.name} team will read it personally — usually within a few business days. If we want to move forward, you'll hear from us by email.
            </p>
            <div className="row" style={{ justifyContent: "center", marginTop: 24 }}>
              <Link href="/" className="btn">See other open roles</Link>
            </div>
          </Glass>
        </section>
      </>
    );
  }

  return (
    <>
      <Glass className="career-nav glass-strong">
        <WorkspaceMark workspace={{ name: ws.name, color: ws.color }} />
        <div style={{ fontWeight: 600, fontSize: 17 }}>{ws.name}</div>
        <div style={{ flex: 1 }} />
        <Link href={`/jobs/${job.slug}`} className="tiny" style={{ color: "var(--ink-1)" }}>← Back to role</Link>
      </Glass>

      <section style={{ maxWidth: 760, margin: "40px auto", padding: "0 32px" }}>
        <h1 style={{ fontSize: 36 }}>Apply for <span className="serif" style={{ fontStyle: "italic" }}>{job.title}</span></h1>
        <p className="muted" style={{ marginTop: 8 }}>{[job.department, job.location].filter(Boolean).join(" · ")}</p>

        <Glass className="card" style={{ padding: 36, marginTop: 28 }}>
          <ApplyForm
            workspaceSlug={ws.slug}
            jobSlug={job.slug}
            jobId={job.id}
            screening={job.screening.map((q) => ({ id: q.id, label: q.label, kind: q.kind, required: q.required }))}
          />
        </Glass>
      </section>
    </>
  );
}
