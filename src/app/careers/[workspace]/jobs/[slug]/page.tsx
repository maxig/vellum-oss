// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Glass, Chip, Icons, WorkspaceMark } from "@/components/primitives";
import { fmtMoney } from "@/lib/utils";
import RichText from "@/components/RichText";
import { stripHtml } from "@/lib/sanitize";
import { recordCareerEvent } from "@/lib/career-events";

export const dynamic = "force-dynamic";

export default async function CareersJobPage({ params }: { params: Promise<{ workspace: string; slug: string }> }) {
  const p = await params;
  const ws = await db.workspace.findUnique({
    where: { slug: p.workspace },
    include: { careerSite: true },
  });
  if (!ws) notFound();
  const job = await db.job.findFirst({
    where: { workspaceId: ws.id, slug: p.slug, status: "Open" },
    include: {
      hiringTeam: { include: { user: { select: { name: true, email: true } } } },
    },
  });
  if (!job) notFound();

  // Career-site analytics — page view per (session, job, recent). Fire-
  // and-forget; never blocks render. Powers `top_job_views`, `new_visitors`.
  await recordCareerEvent({
    workspaceId: ws.id,
    kind: "page_view",
    jobId: job.id,
    path: `/careers/${p.workspace}/jobs/${p.slug}`,
  });

  const requirements = (job.requirements as string[]) || [];
  const niceToHave = (job.niceToHave as string[]) || [];
  const processSteps = (job.processSteps as { n: string; who: string; d: string }[]) || [];
  // Hiring team is now a relation — surface name + role for the public
  // career-site display. Email is intentionally not exposed.
  const hiringTeam = job.hiringTeam.map((m) => ({
    name: m.user.name || "Team member",
    role: m.role,
  }));

  // Always render salaries in the workspace's current currency — recruiters
  // expect the public site to flip in lock-step with their settings.
  const currency = ws.currency || job.salaryCurrency || "EUR";
  const salary = job.salaryDisplay || fmtMoney(job.salaryMin, job.salaryMax, currency) || null;

  const jobPostingLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: stripHtml(job.description || job.pitch || "").slice(0, 4000),
    employmentType: job.employment || undefined,
    datePosted: (job.publishedAt || job.createdAt).toISOString(),
    hiringOrganization: { "@type": "Organization", name: ws.name, sameAs: `http://${ws.domain}` },
    jobLocation: job.location
      ? { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location } }
      : undefined,
    baseSalary:
      job.salaryMin || job.salaryMax
        ? {
            "@type": "MonetaryAmount",
            currency,
            value: { "@type": "QuantitativeValue", minValue: job.salaryMin, maxValue: job.salaryMax, unitText: "YEAR" },
          }
        : undefined,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingLd) }} />

      <Glass className="career-nav glass-strong">
        <WorkspaceMark workspace={{ name: ws.name, color: ws.color }} />
        <div style={{ fontWeight: 600, fontSize: 17 }}>{ws.name}</div>
        <div style={{ flex: 1 }} />
        <Link href={`/`} className="tiny" style={{ color: "var(--ink-1)" }}>← All roles</Link>
      </Glass>

      <section style={{ maxWidth: 880, margin: "40px auto 0", padding: "0 32px" }}>
        <div className="row" style={{ gap: 10, marginBottom: 12 }}>
          <Chip good dot>Open</Chip>
          {job.department && <span className="tiny">{job.department}</span>}
          {job.location && <span className="tiny">· {job.location}</span>}
          {job.employment && <span className="tiny">· {job.employment}</span>}
        </div>
        <h1 style={{ fontSize: 48, letterSpacing: "-0.03em", lineHeight: 1.05 }}>{job.title}</h1>
        {job.pitch && <p className="serif" style={{ fontStyle: "italic", fontSize: 22, color: "var(--ink-1)", marginTop: 18, lineHeight: 1.45 }}>{job.pitch}</p>}
        <div className="row" style={{ marginTop: 26, gap: 10 }}>
          <Link href={`/jobs/${job.slug}/apply`} className="btn btn-primary btn-lg">
            <Icons.ArrowUpRight size={14}/> Apply for this role
          </Link>
          {salary && <span className="tiny">{salary}</span>}
        </div>
      </section>

      <section style={{ maxWidth: 880, margin: "40px auto", padding: "0 32px" }}>
        <Glass className="card" style={{ padding: 36, lineHeight: 1.65 }}>
          <h2 style={{ marginBottom: 12 }}>About the role</h2>
          <RichText
            html={job.description}
            style={{ fontSize: 16, color: "var(--ink-1)" }}
            fallback={<p className="muted">More details coming soon.</p>}
          />

          {!!requirements.length && (
            <>
              <h2 style={{ marginTop: 28, marginBottom: 10 }}>What you'll bring</h2>
              <ul style={{ paddingLeft: 0, listStyle: "none" }}>
                {requirements.map((r) => (
                  <li key={r} className="row" style={{ alignItems: "flex-start", padding: "6px 0" }}>
                    <Icons.Check size={14} style={{ color: "var(--accent-solid)", marginTop: 5, flexShrink: 0 }} stroke={2.4} />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {!!niceToHave.length && (
            <>
              <h2 style={{ marginTop: 28, marginBottom: 10 }}>Nice to have</h2>
              <div className="taglist">{niceToHave.map((n) => <span key={n} className="chip">{n}</span>)}</div>
            </>
          )}

          {!!processSteps.length && (
            <>
              <h2 style={{ marginTop: 28, marginBottom: 14 }}>Our hiring process</h2>
              <div>
                {processSteps.map((s, i) => (
                  <div key={i} className="timeline-item">
                    <div className="timeline-dot">{i + 1}</div>
                    <div>
                      <div style={{ fontWeight: 500 }}>{s.n}</div>
                      <div className="tiny" style={{ marginTop: 2 }}>{s.who}</div>
                      {s.d && <p className="tiny" style={{ marginTop: 6, color: "var(--ink-1)" }}>{s.d}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {salary && (
            <>
              <h2 style={{ marginTop: 28, marginBottom: 10 }}>Compensation</h2>
              <p>{salary}</p>
            </>
          )}

          <div className="row" style={{ marginTop: 32, justifyContent: "center" }}>
            <Link href={`/jobs/${job.slug}/apply`} className="btn btn-primary btn-lg">
              Apply for this role <Icons.ArrowRight size={14} stroke={2} />
            </Link>
          </div>
        </Glass>
      </section>
    </>
  );
}
