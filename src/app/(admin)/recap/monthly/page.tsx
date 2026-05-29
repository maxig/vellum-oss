// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// Monthly board-style report — print-optimized HTML page.
//
// Renders the full 8-section RECAP_FEATURE.md §9.4 layout. Designed to be
// opened in a browser tab and saved as PDF via the OS print dialog
// (Cmd/Ctrl + P → "Save as PDF"). The "Save as PDF" button at the top
// fires window.print() to make that one click.
//
// Headed page printing: we use @media print styles to hide the toolbar
// and set sensible margins, so the printed output matches the email body.

import * as React from "react";
import { requireWorkspace } from "@/lib/workspace";
import { buildMonthlyReport, type MonthlyReport } from "@/lib/recap-monthly";
import { Glass, AIPill, Icons } from "@/components/primitives";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

export default async function MonthlyRecapPage() {
  const { workspace } = await requireWorkspace();
  const report = await buildMonthlyReport(workspace.id);

  if (!report) {
    return (
      <div className="page">
        <h1>Monthly recap</h1>
        <p className="muted">Couldn't build the monthly report.</p>
      </div>
    );
  }

  return (
    <div className="page recap-monthly-page">
      {/* Toolbar — hidden in print. */}
      <div className="row recap-monthly-toolbar" style={{ marginBottom: 24, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div className="tiny" style={{ marginBottom: 4 }}>Monthly recap · {report.workspaceName}</div>
          <h1 style={{ fontSize: 28, letterSpacing: "-0.02em" }}>{prettyMonth(report.scopeStart)}</h1>
        </div>
        <PrintButton />
      </div>

      <style>{`
        @media print {
          .recap-monthly-toolbar { display: none !important; }
          .scrim, .sheet, [data-portal] { display: none !important; }
          body, .page { background: #fff !important; color: #000 !important; }
          .recap-monthly-page { padding: 0 !important; max-width: 100% !important; }
          .recap-monthly-section { break-inside: avoid; }
          @page { margin: 18mm; size: A4; }
        }
        .recap-monthly-section { margin-bottom: 22px; }
        .recap-monthly-grid { display: grid; gap: 12px; }
      `}</style>

      {/* §1 Headline */}
      <Section title="Headline" report={report} ai>
        <p style={{ fontSize: 16, lineHeight: 1.6 }}>{report.headline}</p>
      </Section>

      {/* §2 Numbers */}
      <Section title="The numbers" report={report}>
        <div className="recap-monthly-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          <Stat label="Applications" value={String(report.numbers.applications)} />
          <Stat label="Hires" value={String(report.numbers.hires)} />
          <Stat label="Offers" value={String(report.numbers.offers)} />
          <Stat label="Time to hire" value={report.numbers.timeToHireDays != null ? `${report.numbers.timeToHireDays}d` : "—"} />
          <Stat label="Open roles" value={String(report.numbers.openRoles)} />
          <Stat label="Active candidates" value={String(report.numbers.activeCandidates)} />
          <Stat label="Pipeline health" value={`${report.numbers.pipelineHealthScore} / 100`} />
        </div>
      </Section>

      {/* §3 Pipeline health */}
      <Section title="Pipeline health" report={report}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--ink-2)", fontWeight: 500 }}>
              <th style={{ padding: "8px 12px" }}>Stage</th>
              <th style={{ padding: "8px 12px" }}>Active</th>
              <th style={{ padding: "8px 12px" }}>Δ vs prior</th>
            </tr>
          </thead>
          <tbody>
            {report.pipelineHealth.map((s) => (
              <tr key={s.stageKey} style={{ borderTop: "0.5px solid var(--line)" }}>
                <td style={{ padding: "8px 12px" }}>{s.stageName}</td>
                <td style={{ padding: "8px 12px" }}>{s.count}</td>
                <td style={{ padding: "8px 12px", color: s.deltaVsPrior == null ? "var(--ink-2)" : s.deltaVsPrior >= 0 ? "oklch(45% 0.16 150)" : "oklch(55% 0.18 28)" }}>
                  {s.deltaVsPrior == null ? "—" : `${s.deltaVsPrior >= 0 ? "+" : ""}${s.deltaVsPrior}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* §4 Sources */}
      <Section title="Sources" report={report}>
        {report.sources.length === 0 ? (
          <p className="muted">No source data in scope.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--ink-2)", fontWeight: 500 }}>
                <th style={{ padding: "8px 12px" }}>Source</th>
                <th style={{ padding: "8px 12px" }}>Applicants</th>
                <th style={{ padding: "8px 12px" }}>Avg AI fit</th>
              </tr>
            </thead>
            <tbody>
              {report.sources.map((s) => (
                <tr key={s.source} style={{ borderTop: "0.5px solid var(--line)" }}>
                  <td style={{ padding: "8px 12px" }}>{s.source}</td>
                  <td style={{ padding: "8px 12px" }}>{s.count}</td>
                  <td style={{ padding: "8px 12px" }}>{s.avgFit ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* §5 Roles */}
      <Section title="Roles" report={report}>
        <div className="recap-monthly-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {report.roles.map((r) => (
            <Glass key={r.jobId} faint style={{ padding: 14, borderRadius: 10 }}>
              <div style={{ fontWeight: 500, marginBottom: 6 }}>{r.title}</div>
              <div className="tiny">Days open: {r.daysOpen}</div>
              <div className="tiny">Views: {r.views} · Apps: {r.apps} · Hires: {r.hires}</div>
            </Glass>
          ))}
        </div>
      </Section>

      {/* §6 What changed */}
      <Section title="What changed" report={report} ai>
        <p style={{ fontSize: 14, lineHeight: 1.6 }}>{report.whatChanged}</p>
      </Section>

      {/* §7 Risks & housekeeping */}
      <Section title="Risks & housekeeping" report={report}>
        {report.risks.length === 0 ? (
          <p className="muted">Nothing urgent.</p>
        ) : (
          <ul style={{ paddingLeft: 20 }}>
            {report.risks.map((r) => (
              <li key={r.id} style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: 6 }}
                  dangerouslySetInnerHTML={{ __html: renderText(r.text) }} />
            ))}
          </ul>
        )}
      </Section>

      {/* §8 Team */}
      <Section title="Team" report={report}>
        <div className="recap-monthly-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-2)", marginBottom: 6 }}>Top recruiters</div>
            {report.team.topRecruiters.length === 0 ? (
              <p className="tiny">No tracked activity.</p>
            ) : (
              <ul style={{ paddingLeft: 16, fontSize: 13.5 }}>
                {report.team.topRecruiters.map((r) => (
                  <li key={r.userId}>{r.name} — {r.activity}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-2)", marginBottom: 6 }}>Review load</div>
            {report.team.reviewLoad.length === 0 ? (
              <p className="tiny">No reviewer assignments yet.</p>
            ) : (
              <ul style={{ paddingLeft: 16, fontSize: 13.5 }}>
                {report.team.reviewLoad.map((r) => (
                  <li key={r.userId}>{r.name} — {r.assigned}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
  ai,
  report,
}: {
  title: string;
  children: React.ReactNode;
  ai?: boolean;
  report: MonthlyReport;
}) {
  return (
    <Glass className="card recap-monthly-section" style={{ padding: 22, borderRadius: 14 }}>
      <div className="row" style={{ marginBottom: 12, alignItems: "baseline" }}>
        <h2 style={{ fontSize: 18, flex: 1 }}>{title}</h2>
        {ai && report.hasAI ? <AIPill>Vellum AI</AIPill> : null}
      </div>
      {children}
    </Glass>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Glass faint style={{ padding: 14, borderRadius: 10 }}>
      <div className="tiny" style={{ color: "var(--ink-2)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{value}</div>
    </Glass>
  );
}

function renderText(text: string): string {
  const escaped = text.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
  return escaped.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}

function prettyMonth(d: Date) {
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

// Override the unused Icons import warning.
void Icons;
