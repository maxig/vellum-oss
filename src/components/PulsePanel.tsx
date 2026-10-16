// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";

// PulsePanel — the fuller Pulse audit surface on the candidate profile sheet.
// See PULSE_FEATURE.md §8.4. Shows the score, band, 14-day sparkline, and the
// full signal log (newest first) — every entry the breakdown popover skipped.

import * as React from "react";
import { Glass, AIPill, Icons } from "@/components/primitives";
import { useTranslations } from "next-intl";
import { useRelativeTime } from "@/i18n/format";

type Signal = {
  id: string;
  kind: string;
  polarity: "pos" | "neg";
  weight: number;
  source: string;
  at: string;
  evidence?: Record<string, unknown>;
};
type Breakdown = {
  candidateId: string;
  score: number;
  band: "hot" | "warm" | "cool" | "cold" | "silent" | "locked";
  baseline: number;
  updatedAt: string | null;
  signals: Signal[];
  sparkline: number[];
};

// Labels: common.pulse.bands.<band>
const BAND_META: Record<Breakdown["band"], { emoji: string; dot: string; tint: string; ink: string }> = {
  hot:    { emoji: "🔥", dot: "oklch(70% 0.18 28)",  tint: "color-mix(in oklab, oklch(70% 0.18 28) 14%, transparent)",  ink: "oklch(55% 0.18 28)" },
  warm:   { emoji: "☀",  dot: "oklch(72% 0.13 80)",  tint: "color-mix(in oklab, oklch(72% 0.13 80) 12%, transparent)",  ink: "oklch(50% 0.14 80)" },
  cool:   { emoji: "🌤", dot: "oklch(72% 0.12 230)", tint: "color-mix(in oklab, oklch(72% 0.12 230) 14%, transparent)", ink: "oklch(50% 0.14 230)" },
  cold:   { emoji: "❄️", dot: "oklch(60% 0.16 28)",  tint: "color-mix(in oklab, oklch(60% 0.16 28) 16%, transparent)",  ink: "oklch(50% 0.18 28)" },
  silent: { emoji: "💤", dot: "oklch(70% 0.02 250)", tint: "var(--glass-bg-faint)",                                      ink: "var(--ink-2)" },
  locked: { emoji: "✖",  dot: "oklch(50% 0.02 250)", tint: "var(--glass-bg-faint)",                                      ink: "var(--ink-2)" },
};

export default function PulsePanel({ candidateId }: { candidateId: string }) {
  const tp = useTranslations("common.pulse");
  const relativeTime = useRelativeTime();
  const [data, setData] = React.useState<Breakdown | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [recomputing, setRecomputing] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/pulse/${candidateId}`, { cache: "no-store" });
      if (r.ok) setData(await r.json());
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function recompute() {
    setRecomputing(true);
    try {
      await fetch(`/api/pulse/${candidateId}`, { method: "POST" });
      await load();
    } finally {
      setRecomputing(false);
    }
  }

  if (loading && !data) {
    return (
      <Glass style={{ padding: 18, marginBottom: 18 }}>
        <div className="ai-shimmer" style={{ height: 70, borderRadius: 10 }} />
      </Glass>
    );
  }
  if (!data) return null;

  const band = data.band in BAND_META ? data.band : "warm";
  const meta = BAND_META[band];

  return (
    <Glass style={{ padding: 18, marginBottom: 18 }}>
      <div className="row" style={{ marginBottom: 10 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "3px 9px", borderRadius: 999,
          background: meta.tint, color: meta.ink, fontSize: 12, fontWeight: 600,
        }}>
          <span className="chip-dot" style={{ width: 7, height: 7, borderRadius: 999, background: meta.dot }} />
          Pulse · {data.score} {meta.emoji}
        </span>
        <span style={{ flex: 1 }} />
        <AIPill>{tp(`bands.${band}`)}</AIPill>
        <button className="btn btn-sm btn-ghost" onClick={recompute} disabled={recomputing} style={{ marginLeft: 8 }}>
          {recomputing ? <span className="ai-shimmer" style={{ width: 12, height: 12, borderRadius: 50 }}/> : <Icons.Sparkle size={11} stroke={2}/>}
          {tp("recompute")}
        </button>
      </div>

      <Sparkline data={data.sparkline} />

      <div className="row" style={{ marginTop: 8, fontSize: 11.5, color: "var(--ink-2)" }}>
        <span>{tp("daysAgo14")}</span>
        <span style={{ flex: 1 }} />
        <span>{tp("today")}</span>
      </div>

      <div style={{ marginTop: 14, borderTop: "0.5px solid var(--line)", paddingTop: 12 }}>
        <div className="row" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-1)", flex: 1 }}>
            {tp("signalsCount", { count: data.signals.length })}
          </span>
          <span className="tiny">{tp("baseline", { value: data.baseline })}</span>
        </div>
        {data.signals.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {tp("noSignalsLong")}
          </p>
        ) : (
          <div className="col" style={{ gap: 4, maxHeight: 220, overflowY: "auto" }}>
            {data.signals.map((s) => (
              <div key={s.id} className="row" style={{ gap: 10, fontSize: 12.5, padding: "4px 0" }}>
                <span style={{
                  color: s.polarity === "neg" ? "oklch(55% 0.18 28)" : "var(--accent-solid)",
                  fontVariantNumeric: "tabular-nums",
                  minWidth: 26, textAlign: "right", fontWeight: 600,
                }}>
                  {s.polarity === "neg" ? "−" : "+"}{s.weight}
                </span>
                <span style={{ flex: 1, color: "var(--ink-1)" }}>{SIGNAL_KINDS.has(s.kind) ? tp(`signalsLong.${s.kind as "message_received"}`) : s.kind}</span>
                <span className="tiny mono">{relativeTime(new Date(s.at))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Glass>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const h = 36;
  return (
    <div className="row" style={{ gap: 2, alignItems: "flex-end", height: h }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${Math.max(3, (v / 100) * h)}px`,
            background: "linear-gradient(180deg, var(--accent-1), var(--accent-2))",
            borderRadius: 2,
            opacity: i === data.length - 1 ? 1 : 0.7,
          }}
          title={`Day -${data.length - 1 - i}: ${v}`}
        />
      ))}
    </div>
  );
}

// Labels: common.pulse.signalsLong.<kind>
const SIGNAL_KINDS = new Set([
  "message_received", "message_fast_reply", "message_long_reply", "positive_sentiment",
  "question_asked", "link_clicked", "email_opened", "no_reply_overdue", "no_open",
  "stage_idle", "negative_sentiment", "reschedule_requested", "interview_no_show",
  "unsubscribe", "stage_advanced", "offer_sent",
]);
