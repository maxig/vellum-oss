// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";

import * as React from "react";
import Link from "next/link";
import { Glass, Icons, AIPill } from "@/components/primitives";
import type { IconName } from "@/components/Icons";
import type {
  AnalyticsBundle,
  AnalyticsDayPoint,
  AnalyticsRange,
} from "@/lib/analytics";
import type { AnalyticsInsight } from "@/lib/analytics-summary";
import { AnalyticsControls, RegenerateButton } from "./AnalyticsControls";

type Props = {
  data: AnalyticsBundle;
  comparing: boolean;
  insights: AnalyticsInsight[];
  summaryGeneratedAt: string;
  summaryMocked: boolean;
};

export default function AnalyticsView(props: Props) {
  const { data, comparing, insights, summaryGeneratedAt, summaryMocked } = props;
  const range = data.range;
  const series = data.series;
  const prevSeries = data.prevSeries;
  const k = data.kpis;

  const conv = k.visits ? (k.applies / k.visits) * 100 : 0;
  const prevConv = k.prevVisits ? (k.prevApplies / k.prevVisits) * 100 : 0;
  const delta = (cur: number, prev: number) => (prev ? ((cur - prev) / prev) * 100 : 0);

  const compareSeries = comparing ? prevSeries : null;

  return (
    <div className="page" style={{ maxWidth: 1300 }}>
      {/* Header */}
      <div className="row" style={{ marginBottom: 22, alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 28 }}>Careers analytics</h1>
          <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
            How visitors are finding and engaging with <b className="mono">{data.domain}</b>.
          </p>
        </div>
        <AnalyticsControls range={range} comparing={comparing} />
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
        <Kpi
          icon="Eye"
          label="Page views"
          value={k.visits}
          delta={comparing ? delta(k.visits, k.prevVisits) : null}
          prev={k.prevVisits}
          comparing={comparing}
        />
        <Kpi
          icon="Users"
          label="Unique visitors"
          value={k.uniques}
          delta={comparing ? delta(k.uniques, k.prevUniques) : null}
          prev={k.prevUniques}
          comparing={comparing}
        />
        <Kpi
          icon="Send"
          label="Applications"
          value={k.applies}
          delta={comparing ? delta(k.applies, k.prevApplies) : null}
          prev={k.prevApplies}
          comparing={comparing}
          accent
        />
        <Kpi
          icon="TrendUp"
          label="Conversion rate"
          value={conv.toFixed(2) + "%"}
          delta={comparing ? conv - prevConv : null}
          prev={prevConv.toFixed(2) + "%"}
          comparing={comparing}
          ptDelta
        />
      </div>

      {/* Main chart */}
      <Glass style={{ padding: 22, borderRadius: 16, marginBottom: 14 }}>
        <div className="row" style={{ marginBottom: 18 }}>
          <h3 style={{ flex: 1 }}>Visits &amp; applications</h3>
          <div className="row" style={{ gap: 14 }}>
            <LegendDot color="var(--accent-1)" label="Page views" />
            <LegendDot color="var(--accent-solid)" label="Unique visitors" filled />
            <LegendDot color="oklch(68% 0.16 150)" label="Applications" filled />
          </div>
        </div>
        <Chart series={series} prev={compareSeries} range={range} />
      </Glass>

      {/* Funnel + Sources */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 14, marginBottom: 14 }}>
        <Glass style={{ padding: 22, borderRadius: 16 }}>
          <h3 style={{ marginBottom: 6 }}>Conversion funnel</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
            Where visitors drop off between landing and submitting.
          </p>
          <Funnel
            steps={[
              { l: "Visited careers site", n: data.funnel.visited, color: "var(--accent-1)" },
              {
                l: "Viewed a job",
                n: data.funnel.viewedJob,
                color: "color-mix(in oklab, var(--accent-1) 70%, var(--accent-2))",
              },
              { l: "Clicked Apply", n: data.funnel.clickedApply, color: "var(--accent-2)" },
              {
                l: "Started application",
                n: data.funnel.startedApply,
                color: "color-mix(in oklab, var(--accent-2) 70%, oklch(68% 0.16 150))",
              },
              { l: "Submitted application", n: data.funnel.submitted, color: "oklch(68% 0.16 150)" },
            ]}
          />
        </Glass>

        <Glass style={{ padding: 22, borderRadius: 16 }}>
          <h3 style={{ marginBottom: 4 }}>Top sources</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>Where visits came from.</p>
          {data.sources.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>No referrer data yet.</div>
          ) : (
            <div className="col" style={{ gap: 10 }}>
              {data.sources.map((s) => (
                <div key={s.name}>
                  <div className="row" style={{ marginBottom: 4 }}>
                    <span className="chip-dot" style={{ background: s.color, marginRight: 8 }} />
                    <span style={{ fontSize: 13, flex: 1 }}>{s.name}</span>
                    <span className="mono tiny" style={{ color: "var(--ink-0)" }}>{s.visits.toLocaleString()}</span>
                    <span className="tiny" style={{ width: 38, textAlign: "right" }}>{(s.pct * 100).toFixed(0)}%</span>
                  </div>
                  <div className="funnel-bar">
                    <div style={{ height: "100%", width: s.pct * 100 + "%", background: s.color, borderRadius: 999 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Glass>
      </div>

      {/* Top jobs + Pages */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Glass style={{ padding: 22, borderRadius: 16 }}>
          <div className="row" style={{ marginBottom: 18 }}>
            <h3 style={{ flex: 1 }}>Top jobs by views</h3>
            <Link href="/jobs" className="btn btn-sm btn-ghost">
              All jobs <Icons.ChevronRight size={11} />
            </Link>
          </div>
          {data.topJobs.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>No job views yet in this window.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--ink-2)", fontWeight: 500 }}>
                  <th style={{ textAlign: "left", padding: "6px 0", fontWeight: 500, fontSize: 11.5 }}>JOB</th>
                  <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 500, fontSize: 11.5 }}>VIEWS</th>
                  <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 500, fontSize: 11.5 }}>APPLIES</th>
                  <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 500, fontSize: 11.5 }}>CONV</th>
                </tr>
              </thead>
              <tbody>
                {data.topJobs.map((j) => (
                  <tr key={j.id} style={{ borderTop: "0.5px solid var(--line)" }}>
                    <td style={{ padding: "10px 0", color: "var(--ink-0)" }}>{j.title}</td>
                    <td className="mono" style={{ textAlign: "right", padding: "10px 0" }}>
                      {j.views.toLocaleString()}
                    </td>
                    <td className="mono" style={{ textAlign: "right", padding: "10px 0" }}>{j.applies}</td>
                    <td style={{ textAlign: "right", padding: "10px 0" }}>
                      <span
                        className="chip"
                        style={{
                          height: 18,
                          fontSize: 10.5,
                          padding: "0 7px",
                          background: j.conv > 3
                            ? "color-mix(in oklab, oklch(68% 0.16 150) 16%, transparent)"
                            : "var(--glass-bg-faint)",
                          color: j.conv > 3 ? "oklch(45% 0.16 150)" : "var(--ink-2)",
                          borderColor: "transparent",
                        }}
                      >
                        {j.conv.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Glass>

        <Glass style={{ padding: 22, borderRadius: 16 }}>
          <h3 style={{ marginBottom: 18 }}>Top pages</h3>
          {data.pages.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>No page views yet in this window.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--ink-2)", fontWeight: 500 }}>
                  <th style={{ textAlign: "left", padding: "6px 0", fontWeight: 500, fontSize: 11.5 }}>PATH</th>
                  <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 500, fontSize: 11.5 }}>VIEWS</th>
                  <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 500, fontSize: 11.5 }}>AVG. TIME</th>
                  <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 500, fontSize: 11.5 }}>BOUNCE</th>
                </tr>
              </thead>
              <tbody>
                {data.pages.map((p) => (
                  <tr key={p.path} style={{ borderTop: "0.5px solid var(--line)" }}>
                    <td
                      className="mono"
                      style={{
                        padding: "10px 0",
                        fontSize: 12,
                        color: "var(--ink-0)",
                        maxWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.path}
                    </td>
                    <td className="mono" style={{ textAlign: "right", padding: "10px 0" }}>
                      {p.visits.toLocaleString()}
                    </td>
                    <td className="tiny mono" style={{ textAlign: "right", padding: "10px 0" }}>{p.time}</td>
                    <td
                      className="tiny mono"
                      style={{
                        textAlign: "right",
                        padding: "10px 0",
                        color: p.bounce > 0.35 ? "oklch(60% 0.16 28)" : "var(--ink-2)",
                      }}
                    >
                      {(p.bounce * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Glass>
      </div>

      {/* Geo + Devices */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 14, marginBottom: 14 }}>
        <Glass style={{ padding: 22, borderRadius: 16 }}>
          <h3 style={{ marginBottom: 18 }}>Where they're visiting from</h3>
          {data.countries.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>
              No country-tagged traffic yet. We read country from request headers (Vercel / Cloudflare); it'll fill in once
              the site is live behind one of those edges.
            </div>
          ) : (
            <div className="col" style={{ gap: 8 }}>
              {data.countries.map((c) => (
                <div key={c.code} className="row" style={{ gap: 10 }}>
                  <div
                    style={{
                      width: 28,
                      height: 20,
                      borderRadius: 4,
                      overflow: "hidden",
                      background: flagFor(c.code),
                      border: "0.5px solid var(--line)",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 13, flex: 1 }}>{c.name}</span>
                  <span className="mono tiny" style={{ color: "var(--ink-0)" }}>{c.visits.toLocaleString()}</span>
                  <div style={{ width: 100 }}>
                    <div className="funnel-bar">
                      <div className="funnel-fill" style={{ width: c.pct * 100 + "%" }} />
                    </div>
                  </div>
                  <span className="tiny" style={{ width: 32, textAlign: "right" }}>{(c.pct * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
        </Glass>

        <Glass style={{ padding: 22, borderRadius: 16 }}>
          <h3 style={{ marginBottom: 18 }}>Devices</h3>
          {data.devices.every((d) => d.pct === 0) ? (
            <div className="muted" style={{ fontSize: 13 }}>No device data yet in this window.</div>
          ) : (
            <DonutChart data={data.devices} />
          )}
        </Glass>
      </div>

      {/* AI insight */}
      <Glass
        style={{
          padding: 22,
          borderRadius: 16,
          background:
            "linear-gradient(160deg, color-mix(in oklab, var(--accent-1) 8%, var(--glass-bg)), color-mix(in oklab, var(--accent-2) 6%, var(--glass-bg)))",
        }}
      >
        <div className="row" style={{ marginBottom: 12 }}>
          <AIPill>Vellum AI · weekly summary</AIPill>
          <span style={{ flex: 1 }} />
          <span className="tiny" style={{ color: "var(--ink-2)", marginRight: 10 }}>
            Updated {formatRelative(summaryGeneratedAt)}
            {summaryMocked ? " · mock" : ""}
          </span>
          <RegenerateButton range={range} />
        </div>
        <div className="col" style={{ gap: 12 }}>
          {insights.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>Not enough traffic in this window for a summary yet.</div>
          ) : (
            insights.map((ins, i) => <Insight key={i} tone={ins.tone}>{renderBoldMarkup(ins.body)}</Insight>)
          )}
        </div>
      </Glass>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  delta,
  prev,
  comparing,
  accent,
  ptDelta,
}: {
  icon: IconName;
  label: string;
  value: number | string;
  delta: number | null;
  prev: number | string;
  comparing: boolean;
  accent?: boolean;
  ptDelta?: boolean;
}) {
  const I = Icons[icon];
  const up = delta != null && delta >= 0;
  return (
    <Glass style={{ padding: 18, borderRadius: 14 }}>
      <div className="row" style={{ marginBottom: 14 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: accent ? "linear-gradient(135deg, var(--accent-1), var(--accent-2))" : "var(--glass-bg-faint)",
            border: "0.5px solid " + (accent ? "transparent" : "var(--line)"),
            color: accent ? "white" : "var(--ink-1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <I size={14} />
        </div>
        <span className="tiny" style={{ flex: 1, fontWeight: 500 }}>{label}</span>
      </div>
      <div className="stat-value" style={{ marginBottom: 6 }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {delta != null && comparing && (
        <div className="row" style={{ gap: 6, fontSize: 12 }}>
          <span style={{ color: up ? "oklch(55% 0.14 150)" : "oklch(58% 0.16 28)", fontWeight: 500 }}>
            {up ? "↑" : "↓"} {Math.abs(delta).toFixed(ptDelta ? 2 : 0)}
            {ptDelta ? "pt" : "%"}
          </span>
          <span className="tiny">vs prev. {typeof prev === "number" ? prev.toLocaleString() : prev}</span>
        </div>
      )}
    </Glass>
  );
}

function LegendDot({ color, label, filled }: { color: string; label: string; filled?: boolean }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 50,
          background: filled ? color : "transparent",
          border: "1.5px solid " + color,
        }}
      />
      <span className="tiny" style={{ color: "var(--ink-1)" }}>{label}</span>
    </div>
  );
}

function Chart({
  series,
  prev,
  range,
}: {
  series: AnalyticsDayPoint[];
  prev: AnalyticsDayPoint[] | null;
  range: AnalyticsRange;
}) {
  const h = 200;
  const max = Math.max(...series.map((d) => d.visits), ...(prev ? prev.map((d) => d.visits) : [0]), 1) * 1.1;
  const points = (arr: AnalyticsDayPoint[], k: "visits" | "uniques" | "applies", scale = 1) =>
    arr
      .map((d, i) => `${(i / Math.max(1, arr.length - 1)) * 1000},${(1 - (d[k] * scale) / max) * h}`)
      .join(" ");
  const area = (arr: AnalyticsDayPoint[], k: "visits" | "uniques" | "applies") =>
    `M0,${h} L${points(arr, k)} L1000,${h} Z`;
  const grid = [0.25, 0.5, 0.75];

  // Applies fits in the same chart by scaling up — the gradient on the
  // visits area already dominates the visual hierarchy.
  const appliesScale = 30;

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 1000 ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 240, display: "block" }}>
        {grid.map((g) => (
          <line key={g} x1={0} x2={1000} y1={h * g} y2={h * g} stroke="var(--line)" strokeWidth={0.5} strokeDasharray="2 4" />
        ))}
        <defs>
          <linearGradient id="vis-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-1)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--accent-1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area(series, "visits")} fill="url(#vis-grad)" />
        {prev && prev.length === series.length && (
          <polyline
            points={points(prev, "visits")}
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth={1.2}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <polyline
          points={points(series, "visits")}
          fill="none"
          stroke="var(--accent-1)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={points(series, "uniques")}
          fill="none"
          stroke="var(--accent-solid)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={points(series, "applies", appliesScale)}
          fill="none"
          stroke="oklch(68% 0.16 150)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
        <span className="tiny">{range} days ago</span>
        <span className="tiny">Today</span>
      </div>
    </div>
  );
}

function Funnel({ steps }: { steps: { l: string; n: number; color: string }[] }) {
  const max = Math.max(steps[0].n, 1);
  return (
    <div className="col" style={{ gap: 6 }}>
      {steps.map((s, i) => {
        const pct = (s.n / max) * 100;
        const prev = i > 0 ? steps[i - 1].n : 0;
        const drop = i > 0 && prev > 0 ? (1 - s.n / prev) * 100 : 0;
        return (
          <div key={s.l}>
            <div className="row" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 13.5, flex: 1, color: "var(--ink-0)" }}>{s.l}</span>
              {i > 0 && prev > 0 && (
                <span className="tiny" style={{ color: "oklch(60% 0.16 28)", marginRight: 10 }}>
                  ↓ {drop.toFixed(0)}%
                </span>
              )}
              <span
                className="mono"
                style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-0)", fontVariantNumeric: "tabular-nums" }}
              >
                {s.n.toLocaleString()}
              </span>
            </div>
            <div
              style={{
                height: 28,
                borderRadius: 6,
                background: "var(--glass-bg-faint)",
                border: "0.5px solid var(--line)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: pct + "%",
                  background: `linear-gradient(90deg, ${s.color}, color-mix(in oklab, ${s.color} 70%, white))`,
                  transition: "width 0.6s cubic-bezier(0.2, 0.9, 0.25, 1)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ data }: { data: { name: string; pct: number }[] }) {
  const r = 70;
  const circ = 2 * Math.PI * r;
  let cum = 0;
  const colors = ["var(--accent-1)", "var(--accent-2)", "oklch(68% 0.16 150)"];
  return (
    <div className="row" style={{ gap: 18, alignItems: "center" }}>
      <svg viewBox="-100 -100 200 200" style={{ width: 170, height: 170, flexShrink: 0, transform: "rotate(-90deg)" }}>
        <circle r={r} fill="none" stroke="var(--glass-bg-faint)" strokeWidth={26} />
        {data.map((d, i) => {
          const off = cum;
          cum += d.pct * circ;
          return (
            <circle
              key={d.name}
              r={r}
              fill="none"
              stroke={colors[i]}
              strokeWidth={26}
              strokeDasharray={`${d.pct * circ} ${circ}`}
              strokeDashoffset={-off}
              style={{ transition: "stroke-dasharray 0.5s" }}
            />
          );
        })}
        <text
          x={0}
          y={0}
          transform="rotate(90)"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontSize: 22, fontWeight: 600, fill: "var(--ink-0)" }}
        >
          100%
        </text>
      </svg>
      <div className="col" style={{ gap: 8, flex: 1 }}>
        {data.map((d, i) => (
          <div key={d.name} className="row">
            <span style={{ width: 10, height: 10, borderRadius: 50, background: colors[i], marginRight: 10 }} />
            <span style={{ fontSize: 13, flex: 1 }}>{d.name}</span>
            <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{(d.pct * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Insight({ tone, children }: { tone: AnalyticsInsight["tone"]; children: React.ReactNode }) {
  const map: Record<AnalyticsInsight["tone"], { icon: IconName; color: string }> = {
    good: { icon: "TrendUp", color: "oklch(60% 0.13 150)" },
    risk: { icon: "X", color: "oklch(60% 0.16 28)" },
    neutral: { icon: "Sparkle", color: "var(--accent-solid)" },
  };
  const { icon, color } = map[tone];
  const I = Icons[icon];
  return (
    <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
      <I size={14} stroke={2} style={{ color, marginTop: 3, flexShrink: 0 }} />
      <div style={{ fontSize: 13.5, color: "var(--ink-1)", lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

function renderBoldMarkup(text: string): React.ReactNode {
  // Minimal **bold** parser — the model prompt asks for at most one bold
  // span per bullet, and we don't want full markdown in the analytics card.
  const out: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const open = text.indexOf("**", i);
    if (open === -1) {
      out.push(text.slice(i));
      break;
    }
    if (open > i) out.push(text.slice(i, open));
    const close = text.indexOf("**", open + 2);
    if (close === -1) {
      out.push(text.slice(open));
      break;
    }
    out.push(
      <b key={k++} style={{ color: "var(--ink-0)" }}>
        {text.slice(open + 2, close)}
      </b>,
    );
    i = close + 2;
  }
  return out;
}

function flagFor(code: string): string {
  switch (code) {
    case "DE": return "linear-gradient(to bottom, #000 33%, #D00 33% 66%, #FFCE00 66%)";
    case "GB": return "linear-gradient(135deg, #012169 0%, #fff 40%, #C8102E 50%, #fff 60%, #012169 100%)";
    case "FR": return "linear-gradient(to right, #0055A4 33%, #fff 33% 66%, #EF4135 66%)";
    case "NL": return "linear-gradient(to bottom, #AE1C28 33%, #fff 33% 66%, #21468B 66%)";
    case "PT": return "linear-gradient(to right, #046A38 35%, #DA291C 35%)";
    case "ES": return "linear-gradient(to bottom, #AA151B 25%, #F1BF00 25% 75%, #AA151B 75%)";
    case "PL": return "linear-gradient(to bottom, #fff 50%, #DC143C 50%)";
    case "US": return "linear-gradient(to bottom, #B22234 0 7.7%, #fff 7.7% 15.4%, #B22234 15.4% 23.1%, #fff 23.1% 30.8%, #B22234 30.8% 38.5%, #fff 38.5% 46.2%, #B22234 46.2% 53.9%)";
    case "IT": return "linear-gradient(to right, #009246 33%, #fff 33% 66%, #CE2B37 66%)";
    case "IE": return "linear-gradient(to right, #169B62 33%, #fff 33% 66%, #FF883E 66%)";
    case "BE": return "linear-gradient(to right, #000 33%, #FAE042 33% 66%, #ED2939 66%)";
    case "AT": return "linear-gradient(to bottom, #ED2939 33%, #fff 33% 66%, #ED2939 66%)";
    case "CH": return "#D52B1E";
    case "DK": return "#C8102E";
    case "SE": return "linear-gradient(to right, #006AA7 0 30%, #FECC00 30% 40%, #006AA7 40%)";
    case "NO": return "#BA0C2F";
    case "FI": return "#003580";
    default: return "var(--glass-bg-faint)";
  }
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  return `${days}d ago`;
}
