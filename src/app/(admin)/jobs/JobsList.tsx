// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Glass, Chip, Icons } from "@/components/primitives";

export type JobRow = {
  id: string;
  title: string;
  department: string;
  location: string;
  applicants: number;
  newThisWeek: number;
  daysOpen: number;
  status: string;
  published: boolean;
};

type Tab = "Open" | "Draft" | "Closed" | "All";
const TABS: Tab[] = ["Open", "Draft", "Closed", "All"];

// Status-chip styling lifted from the design — a tinted background derived
// from the status's accent hue, white-ish text, transparent border. Keeping
// this as a colour map (rather than three separate utility classes) makes the
// dot, chip body, and chip text share one palette per status.
const STATUS_COLORS: Record<string, { fg: string; bg: string }> = {
  Open: { fg: "oklch(45% 0.16 150)", bg: "color-mix(in oklab, oklch(68% 0.16 150) 16%, transparent)" },
  Draft: { fg: "oklch(50% 0.15 60)", bg: "color-mix(in oklab, oklch(70% 0.15 60) 16%, transparent)" },
  Closed: { fg: "var(--ink-2)", bg: "var(--glass-bg-faint)" },
};

export default function JobsList({ rows }: { rows: JobRow[] }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("Open");

  const counts = React.useMemo(() => {
    const c = { Open: 0, Draft: 0, Closed: 0, All: rows.length };
    for (const r of rows) {
      if (r.status === "Open") c.Open++;
      else if (r.status === "Draft") c.Draft++;
      else if (r.status === "Closed") c.Closed++;
    }
    return c;
  }, [rows]);

  const filtered = React.useMemo(
    () => (tab === "All" ? rows : rows.filter((r) => r.status === tab)),
    [rows, tab],
  );

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 22, alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ fontSize: 28 }}>Jobs</h1>
          <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
            {rows.length} total · {counts.Open} actively hiring
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Glass faint style={{ padding: 2, borderRadius: 9, display: "inline-flex", flexShrink: 0 }}>
            {TABS.map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setTab(t)}
                  style={{
                    background: active ? "var(--glass-bg-strong)" : "transparent",
                    border: active ? "0.5px solid var(--glass-border)" : "0.5px solid transparent",
                    color: active ? "var(--ink-0)" : "var(--ink-2)",
                  }}
                >
                  {t}
                  <span className="tiny mono" style={{ marginLeft: 4, opacity: 0.6 }}>
                    {counts[t]}
                  </span>
                </button>
              );
            })}
          </Glass>
          <Link className="btn btn-primary" href="/jobs/new">
            <Icons.Plus size={13} stroke={2} /> New job
          </Link>
        </div>
      </div>

      <Glass style={{ overflow: "hidden", borderRadius: 14 }}>
        {/* Column header */}
        <div
          className="row"
          style={{
            padding: "10px 20px",
            borderBottom: "0.5px solid var(--line)",
            background: "var(--glass-bg-faint)",
            gap: 12,
          }}
        >
          <span className="tiny" style={{ flex: 1, fontWeight: 500 }}>Role</span>
          <span className="tiny" style={{ width: 180, fontWeight: 500 }}>Location</span>
          <span className="tiny" style={{ width: 110, fontWeight: 500, textAlign: "right" }}>Applicants</span>
          <span className="tiny" style={{ width: 80, fontWeight: 500, textAlign: "right" }}>Open</span>
          <span className="tiny" style={{ width: 110, fontWeight: 500, textAlign: "right" }}>Status</span>
        </div>

        {filtered.length === 0 && (
          <div style={{ padding: "40px 24px", textAlign: "center" }}>
            <p className="muted">
              {rows.length === 0
                ? "No jobs yet. Create your first to start collecting applicants."
                : `No ${tab.toLowerCase()} roles right now.`}
            </p>
            {rows.length === 0 && (
              <Link className="btn btn-primary" href="/jobs/new" style={{ marginTop: 16 }}>
                <Icons.Plus size={13} stroke={2} /> Create a job
              </Link>
            )}
          </div>
        )}

        {filtered.map((j) => {
          const colors = STATUS_COLORS[j.status] || STATUS_COLORS.Closed;
          return (
            <div
              key={j.id}
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/jobs/${j.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(`/jobs/${j.id}`);
                }
              }}
              className="job-table-row"
              style={{
                display: "flex",
                alignItems: "center",
                padding: "16px 20px",
                borderBottom: "0.5px solid var(--line)",
                cursor: "pointer",
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 10, alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      letterSpacing: "-0.01em",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {j.title}
                  </span>
                  {j.newThisWeek > 0 && <Chip accent>{j.newThisWeek} new</Chip>}
                </div>
                {j.department && (
                  <div className="tiny" style={{ marginTop: 3 }}>{j.department}</div>
                )}
              </div>
              <div style={{ width: 180 }}>
                {j.location ? (
                  <span className="chip">
                    <Icons.MapPin size={11} stroke={1.8} /> {j.location}
                  </span>
                ) : (
                  <span className="tiny" style={{ color: "var(--ink-3)" }}>—</span>
                )}
              </div>
              <div className="mono" style={{ width: 110, textAlign: "right", fontSize: 13 }}>
                {j.applicants}
              </div>
              <div
                className="mono"
                style={{ width: 80, textAlign: "right", fontSize: 13, color: "var(--ink-2)" }}
              >
                {j.published ? `${j.daysOpen}d` : "—"}
              </div>
              <div style={{ width: 110, textAlign: "right" }}>
                <span
                  className="chip"
                  style={{
                    background: colors.bg,
                    color: colors.fg,
                    borderColor: "transparent",
                    fontWeight: 500,
                  }}
                >
                  <span className="chip-dot" />
                  {j.status}
                </span>
              </div>
            </div>
          );
        })}
      </Glass>
    </div>
  );
}
