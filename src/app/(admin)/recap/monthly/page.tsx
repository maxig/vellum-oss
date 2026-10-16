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
import { getFormatter, getTranslations } from "next-intl/server";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

export default async function MonthlyRecapPage() {
  const { workspace } = await requireWorkspace();
  const t = await getTranslations("dashboard.monthly");
  const format = await getFormatter();
  const report = await buildMonthlyReport(workspace.id);

  if (!report) {
    return (
      <div className="page">
        <h1>{t("title")}</h1>
        <p className="muted">{t("failed")}</p>
      </div>
    );
  }

  return (
    <div className="page recap-monthly-page">
      {/* Toolbar — hidden in print. */}
      <div className="row recap-monthly-toolbar" style={{ marginBottom: 24, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div className="tiny" style={{ marginBottom: 4 }}>{t("title")} · {report.workspaceName}</div>
          <h1 style={{ fontSize: 28, letterSpacing: "-0.02em" }}>{format.dateTime(report.scopeStart, { month: "long", year: "numeric" })}</h1>
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
      <Section title={t("sections.headline")} report={report} ai>
        <p style={{ fontSize: 16, lineHeight: 1.6 }}>{report.headline}</p>
      </Section>

      {/* §2 Numbers */}
      <Section title={t("sections.numbers")} report={report}>
        <div className="recap-monthly-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          <Stat label={t("stats.applications")} value={String(report.numbers.applications)} />
          <Stat label={t("stats.hires")} value={String(report.numbers.hires)} />
          <Stat label={t("stats.offers")} value={String(report.numbers.offers)} />
          <Stat label={t("stats.timeToHire")} value={report.numbers.timeToHireDays != null ? t("days", { n: report.numbers.timeToHireDays }) : "—"} />
          <Stat label={t("stats.openRoles")} value={String(report.numbers.openRoles)} />
          <Stat label={t("stats.active")} value={String(report.numbers.activeCandidates)} />
          <Stat label={t("stats.health")} value={`${report.numbers.pipelineHealthScore} / 100`} />
        </div>
      </Section>

      {/* §3 Pipeline health */}
      <Section title={t("sections.health")} report={report}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--ink-2)", fontWeight: 500 }}>
              <th style={{ padding: "8px 12px" }}>{t("cols.stage")}</th>
              <th style={{ padding: "8px 12px" }}>{t("cols.active")}</th>
              <th style={{ padding: "8px 12px" }}>{t("cols.delta")}</th>
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
      <Section title={t("sections.sources")} report={report}>
        {report.sources.length === 0 ? (
          <p className="muted">{t("noSources")}</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--ink-2)", fontWeight: 500 }}>
                <th style={{ padding: "8px 12px" }}>{t("cols.source")}</th>
                <th style={{ padding: "8px 12px" }}>{t("cols.applicants")}</th>
                <th style={{ padding: "8px 12px" }}>{t("cols.avgFit")}</th>
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
      <Section title={t("sections.roles")} report={report}>
        <div className="recap-monthly-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {report.roles.map((r) => (
            <Glass key={r.jobId} faint style={{ padding: 14, borderRadius: 10 }}>
              <div style={{ fontWeight: 500, marginBottom: 6 }}>{r.title}</div>
              <div className="tiny">{t("daysOpen", { n: r.daysOpen })}</div>
              <div className="tiny">{t("roleStats", { views: r.views, apps: r.apps, hires: r.hires })}</div>
            </Glass>
          ))}
        </div>
      </Section>

      {/* §6 What changed */}
      <Section title={t("sections.changed")} report={report} ai>
        <p style={{ fontSize: 14, lineHeight: 1.6 }}>{report.whatChanged}</p>
      </Section>

      {/* §7 Risks & housekeeping */}
      <Section title={t("sections.risks")} report={report}>
        {report.risks.length === 0 ? (
          <p className="muted">{t("nothingUrgent")}</p>
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
      <Section title={t("sections.team")} report={report}>
        <div className="recap-monthly-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-2)", marginBottom: 6 }}>{t("topRecruiters")}</div>
            {report.team.topRecruiters.length === 0 ? (
              <p className="tiny">{t("noActivity")}</p>
            ) : (
              <ul style={{ paddingLeft: 16, fontSize: 13.5 }}>
                {report.team.topRecruiters.map((r) => (
                  <li key={r.userId}>{r.name} — {r.activity}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-2)", marginBottom: 6 }}>{t("reviewLoad")}</div>
            {report.team.reviewLoad.length === 0 ? (
              <p className="tiny">{t("noReviewers")}</p>
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

// Override the unused Icons import warning.
void Icons;
