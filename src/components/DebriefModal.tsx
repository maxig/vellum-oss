// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";

/**
 * DebriefModal — write or edit the post-interview debrief.
 *
 * One debrief per Interview (1:1 in the schema). Anyone who's a
 * workspace member can submit, but in practice the recruiter would
 * only show the modal to (a) the interviewer themselves, (b) the
 * lead reviewer, or (c) workspace admins. The ProfileSheet decides
 * who sees the button; the API enforces workspace membership.
 *
 * Shape mirrors InterviewDebrief: pros, cons, sentiment, rating
 * (1-5), recommend (strong_yes…strong_no). All optional except the
 * sentiment (defaults to "neutral") so a one-line "looked good" entry
 * is friction-free.
 */

import * as React from "react";
import { Icons } from "@/components/primitives";

type Initial = {
  pros: string | null;
  cons: string | null;
  sentiment: string;
  rating: number | null;
  recommend: string | null;
} | null;

const SENTIMENTS = [
  { v: "positive", l: "Positive", color: "oklch(68% 0.16 150)" },
  { v: "neutral", l: "Neutral", color: "var(--ink-2)" },
  { v: "mixed", l: "Mixed", color: "oklch(70% 0.15 60)" },
  { v: "negative", l: "Negative", color: "oklch(60% 0.18 28)" },
] as const;

const RECOMMENDS = [
  { v: "strong_yes", l: "Strong yes" },
  { v: "yes", l: "Yes" },
  { v: "maybe", l: "Maybe" },
  { v: "no", l: "No" },
  { v: "strong_no", l: "Strong no" },
] as const;

export default function DebriefModal({
  interviewId,
  candidateName,
  interviewKind,
  initial,
  onClose,
  onSaved,
}: {
  interviewId: string;
  candidateName: string;
  interviewKind: string;
  initial: Initial;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pros, setPros] = React.useState(initial?.pros || "");
  const [cons, setCons] = React.useState(initial?.cons || "");
  const [sentiment, setSentiment] = React.useState(initial?.sentiment || "neutral");
  const [rating, setRating] = React.useState<number | null>(initial?.rating ?? null);
  const [recommend, setRecommend] = React.useState<string | null>(initial?.recommend ?? null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/interviews/${interviewId}/debrief`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pros: pros.trim() || null,
        cons: cons.trim() || null,
        sentiment,
        rating,
        recommend,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setError("Could not save debrief.");
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div
        className="sheet glass glass-strong sheet-md"
        role="dialog"
        aria-label="Interview debrief"
      >
        <div className="sheet-hd">
          <div className="grow">
            <div className="topbar-crumb">Interview debrief</div>
            <h2 style={{ fontSize: 18 }}>
              {candidateName} · {interviewKind}
            </h2>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            <Icons.X size={15} />
          </button>
        </div>

        <div className="sheet-body" style={{ padding: 22 }}>
          {/* Sentiment + Recommend — short answers up top */}
          <div className="row" style={{ gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label className="label">Overall feeling</label>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {SENTIMENTS.map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setSentiment(s.v)}
                    className="btn btn-sm"
                    style={{
                      height: 30,
                      padding: "0 12px",
                      fontSize: 12.5,
                      background: sentiment === s.v ? "var(--glass-bg-strong)" : "transparent",
                      borderColor: sentiment === s.v ? "var(--glass-border)" : "var(--line)",
                      color: sentiment === s.v ? "var(--ink-0)" : "var(--ink-2)",
                    }}
                  >
                    <span className="chip-dot" style={{ background: s.color }} />
                    {s.l}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label className="label">Rating</label>
              <div className="row" style={{ gap: 4 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(rating === n ? null : n)}
                    className="iconbtn"
                    style={{
                      width: 32,
                      height: 32,
                      color: rating !== null && n <= rating ? "oklch(75% 0.15 80)" : "var(--ink-3)",
                    }}
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  >
                    <Icons.Star
                      size={16}
                      fill={rating !== null && n <= rating ? "oklch(75% 0.15 80)" : "none"}
                      stroke={rating !== null && n <= rating ? 0 : 1.5}
                    />
                  </button>
                ))}
                {rating !== null && (
                  <button
                    type="button"
                    onClick={() => setRating(null)}
                    className="btn btn-sm btn-ghost"
                    style={{ marginLeft: 6, fontSize: 11 }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label className="label">Recommendation</label>
            <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
              {RECOMMENDS.map((r) => (
                <button
                  key={r.v}
                  type="button"
                  onClick={() => setRecommend(recommend === r.v ? null : r.v)}
                  className="btn btn-sm"
                  style={{
                    height: 28,
                    padding: "0 12px",
                    fontSize: 12,
                    background: recommend === r.v ? "var(--glass-bg-strong)" : "transparent",
                    borderColor: recommend === r.v ? "var(--glass-border)" : "var(--line)",
                    color: recommend === r.v ? "var(--ink-0)" : "var(--ink-2)",
                  }}
                >
                  {r.l}
                </button>
              ))}
            </div>
          </div>

          <div className="row" style={{ gap: 14, alignItems: "stretch" }}>
            <div style={{ flex: 1 }}>
              <label className="label">Pros</label>
              <textarea
                className="input"
                rows={5}
                value={pros}
                onChange={(e) => setPros(e.target.value)}
                placeholder="What stood out? Strengths, signals worth recording."
                style={{ fontFamily: "inherit" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Cons / concerns</label>
              <textarea
                className="input"
                rows={5}
                value={cons}
                onChange={(e) => setCons(e.target.value)}
                placeholder="What raised eyebrows? Gaps, follow-up questions."
                style={{ fontFamily: "inherit" }}
              />
            </div>
          </div>

          {error && (
            <div className="chip chip-danger" style={{ marginTop: 12, display: "inline-flex", padding: "6px 12px", height: "auto" }}>
              {error}
            </div>
          )}
        </div>

        <div className="sheet-ft">
          <span className="tiny" style={{ flex: 1 }}>
            Submitting marks the interview as done and feeds the candidate's Pulse score.
          </span>
          <button className="btn btn-sm" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-sm btn-primary" onClick={save} disabled={saving}>
            <Icons.Check size={11} stroke={2} /> {saving ? "Saving…" : initial ? "Update debrief" : "Submit debrief"}
          </button>
        </div>
      </div>
    </>
  );
}
