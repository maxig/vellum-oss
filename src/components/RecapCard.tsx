// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";

// RecapCard — the "Today's recap" card on the dashboard.
//
// Server-rendered with an initial scope ("today"). Switching to Week / Month
// fires /api/recap?scope=... and replaces items in place. The Refresh button
// hits /api/recap?force=1 to rebuild on demand (rate-limited to 1/min in the
// UI — the server is also tolerant).

import * as React from "react";
import Link from "next/link";
import { Glass, AIPill, Icons } from "@/components/primitives";
import { relativeTime } from "@/lib/utils";
import type { RecapItem, RecapResult, RecapScope } from "@/lib/recap";

type Props = {
  initialRecap: RecapResult | null;
  unreadThreads: number;
};

export default function RecapCard({ initialRecap, unreadThreads }: Props) {
  const [scope, setScope] = React.useState<RecapScope>("today");
  const [recap, setRecap] = React.useState<RecapResult | null>(initialRecap);
  const [loading, setLoading] = React.useState(false);
  const [lastRefresh, setLastRefresh] = React.useState<number>(0);

  // Dates we got back from JSON are strings, but the type says Date. We
  // normalise so relativeTime() works in both server-render and after-fetch.
  function normalize(r: any): RecapResult | null {
    if (!r) return null;
    return {
      ...r,
      generatedAt: new Date(r.generatedAt),
      aiError: Boolean(r.aiError),
    };
  }

  async function loadScope(next: RecapScope) {
    setScope(next);
    setLoading(true);
    try {
      const r = await fetch(`/api/recap?scope=${next}`);
      if (r.ok) {
        const json = await r.json();
        setRecap(normalize(json));
      }
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    // Rate-limit in the UI: at most once per 60 s.
    if (Date.now() - lastRefresh < 60_000) return;
    setLoading(true);
    setLastRefresh(Date.now());
    try {
      const r = await fetch(`/api/recap?scope=${scope}&force=1`);
      if (r.ok) {
        const json = await r.json();
        setRecap(normalize(json));
      }
    } finally {
      setLoading(false);
    }
  }

  const canRefresh = Date.now() - lastRefresh >= 60_000 && !loading;

  return (
    <Glass
      className="card"
      style={{
        padding: 22,
        borderRadius: 14,
        background:
          "linear-gradient(160deg, color-mix(in oklab, var(--accent-1) 8%, var(--glass-bg)), color-mix(in oklab, var(--accent-2) 6%, var(--glass-bg)))",
      }}
    >
      <div className="row" style={{ marginBottom: 10 }}>
        {recap?.hasAI ? <AIPill>Vellum AI</AIPill> : <span className="chip tiny">Snapshot</span>}
        <span style={{ flex: 1 }} />
        {/* Cadence chip group. Reads inline; doesn't shout. */}
        <div className="row" style={{ gap: 2 }}>
          {(["today", "week", "month"] as RecapScope[]).map((s) => (
            <button
              key={s}
              onClick={() => loadScope(s)}
              className="btn btn-sm btn-ghost"
              style={{
                height: 24,
                padding: "0 9px",
                fontSize: 11.5,
                borderRadius: 7,
                background: scope === s ? "var(--glass-bg-strong)" : "transparent",
                border: scope === s ? "0.5px solid var(--glass-border)" : "0.5px solid transparent",
                color: scope === s ? "var(--ink-0)" : "var(--ink-2)",
                textTransform: "capitalize",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="row" style={{ marginBottom: 10, alignItems: "baseline" }}>
        <h3 style={{ fontSize: 15, letterSpacing: "-0.015em", flex: 1, textTransform: "capitalize" }}>
          {/* Per §3 — title becomes "Today's snapshot" when AI is disabled
              so the card reads as a fact list, not an analyst's take. */}
          {recap?.hasAI || recap == null
            ? scope === "today"
              ? "Today's recap"
              : scope === "week"
              ? "This week's recap"
              : "This month's recap"
            : scope === "today"
            ? "Today's snapshot"
            : scope === "week"
            ? "This week's snapshot"
            : "This month's snapshot"}
        </h3>
        <button
          onClick={refresh}
          disabled={!canRefresh}
          title={canRefresh ? "Regenerate now" : "Rate-limited — try again in a minute"}
          className="btn btn-sm btn-ghost"
          style={{ height: 22, padding: "0 6px", opacity: canRefresh ? 1 : 0.5 }}
        >
          {loading ? (
            <span className="ai-shimmer" style={{ width: 12, height: 12, borderRadius: 50 }} />
          ) : (
            <Icons.ArrowRight size={11} stroke={2} style={{ transform: "rotate(-45deg)" }} />
          )}
          <span className="tiny" style={{ marginLeft: 4 }}>
            {recap ? `updated ${relativeTime(recap.generatedAt)}` : "warming up…"}
          </span>
        </button>
      </div>

      <div className="col" style={{ gap: 12 }}>
        {recap && recap.items.length > 0 ? (
          recap.items.map((item) => <RecapRow key={item.id} item={item} />)
        ) : recap ? (
          <p className="muted" style={{ fontSize: 13 }}>
            Quiet so far — the recap will fill in as activity picks up.
          </p>
        ) : (
          <p className="muted" style={{ fontSize: 13 }}>
            Vellum is preparing your first recap. It will appear here in a minute or two.
          </p>
        )}
        {/* §3 — soft notice when AI was attempted but the items came back
            empty (provider error, parse failure, or model returned mock). */}
        {recap?.aiError && (
          <p className="tiny" style={{ color: "var(--ink-2)", marginTop: 4 }}>
            AI insights paused — check Settings → AI.
          </p>
        )}
      </div>

      <div className="row" style={{ marginTop: 16, gap: 8 }}>
        <Link href="/inbox" className="btn btn-sm" style={{ flex: 1, justifyContent: "center" }}>
          {unreadThreads > 0
            ? `Reply to ${unreadThreads} thread${unreadThreads === 1 ? "" : "s"}`
            : "Open inbox"}
        </Link>
        <Link href="/pipeline" className="btn btn-sm btn-primary" style={{ flex: 1, justifyContent: "center" }}>
          Open pipeline <Icons.ArrowRight size={12} stroke={2} />
        </Link>
      </div>
    </Glass>
  );
}

function RecapRow({ item }: { item: RecapItem }) {
  const Ic = (Icons as any)[item.icon] || Icons.Sparkle;
  const color =
    item.severity === "warn"
      ? "oklch(70% 0.15 60)"
      : item.severity === "celebrate"
      ? "oklch(68% 0.16 150)"
      : "var(--accent-solid)";

  const body = (
    <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
      <Ic size={14} stroke={2} style={{ color, marginTop: 3, flexShrink: 0 }} />
      <div
        style={{ fontSize: 13, color: "var(--ink-1)", lineHeight: 1.5, flex: 1 }}
        dangerouslySetInnerHTML={{ __html: renderRecapText(item.text) }}
      />
    </div>
  );

  const wrapped =
    item.source === "ai" ? (
      <div
        style={{
          padding: "8px 10px",
          borderRadius: 8,
          background: "color-mix(in oklab, var(--accent-1) 8%, transparent)",
          borderLeft: "2px solid var(--accent-solid)",
        }}
      >
        {body}
      </div>
    ) : (
      body
    );

  return item.href ? (
    <Link href={item.href} style={{ display: "block" }}>
      {wrapped}
    </Link>
  ) : (
    wrapped
  );
}

function renderRecapText(text: string): string {
  const escaped = text.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<b style="font-weight:500;color:var(--ink-0)">$1</b>');
}
