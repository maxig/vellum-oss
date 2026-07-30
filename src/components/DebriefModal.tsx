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
import { Icons, Stars } from "@/components/primitives";
import { useDialogA11y } from "@/components/useDialogA11y";

export type DebriefCriterion = {
  itemId: string;
  label: string;
  kind: string; // rating | text | yesno
  score?: number | null;
  text?: string | null;
  yesno?: boolean | null;
};
type Kit = {
  id: string;
  name: string;
  description: string | null;
  stageKey: string | null;
  items: { id: string; label: string; hint: string | null; kind: string }[];
};
type Initial = {
  pros: string | null;
  cons: string | null;
  sentiment: string;
  rating: number | null;
  recommend: string | null;
  kitId?: string | null;
  criteria?: DebriefCriterion[] | null;
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

// Shared "selectable pill" styling for the yes/no criterion buttons —
// matches the sentiment/recommend chips.
function pickStyle(active: boolean): React.CSSProperties {
  return {
    height: 26,
    padding: "0 12px",
    fontSize: 12,
    background: active ? "var(--glass-bg-strong)" : "transparent",
    borderColor: active ? "var(--glass-border)" : "var(--line)",
    color: active ? "var(--ink-0)" : "var(--ink-2)",
  };
}

type Answer = { score?: number | null; text?: string | null; yesno?: boolean | null };

export default function DebriefModal({
  interviewId,
  candidateName,
  interviewKind,
  stageKey,
  initial,
  onClose,
  onSaved,
}: {
  interviewId: string;
  candidateName: string;
  interviewKind: string;
  stageKey?: string | null;
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
  const dialogRef = React.useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef);

  // Interview kit (scorecard). Load templates, default to the kit whose
  // stageKey matches this application's stage, and keep per-criterion answers
  // keyed by item id so switching kits doesn't lose overlapping answers.
  const [kits, setKits] = React.useState<Kit[]>([]);
  const [kitId, setKitId] = React.useState<string | null>(initial?.kitId ?? null);
  const [answers, setAnswers] = React.useState<Record<string, Answer>>(() => {
    const seed: Record<string, Answer> = {};
    for (const c of initial?.criteria ?? []) seed[c.itemId] = { score: c.score, text: c.text, yesno: c.yesno };
    return seed;
  });
  // Only auto-pick a stage-default kit for a brand-new debrief. When editing
  // an existing one we respect its saved kit choice — including a deliberate
  // "no kit" (initial set but kitId null).
  const pickedDefault = React.useRef(initial != null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/interview-kits", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.kits) return;
        setKits(j.kits);
        if (!pickedDefault.current) {
          const match = stageKey ? j.kits.find((k: Kit) => k.stageKey === stageKey) : null;
          if (match) setKitId(match.id);
          pickedDefault.current = true;
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [stageKey]);

  const activeKit = kits.find((k) => k.id === kitId) || null;
  function setAnswer(itemId: string, patch: Answer) {
    setAnswers((a) => ({ ...a, [itemId]: { ...a[itemId], ...patch } }));
  }

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
    // Snapshot the active kit's criteria + this author's answers. Dropped
    // when no kit is selected (free-form debrief).
    const criteria: DebriefCriterion[] = activeKit
      ? activeKit.items.map((it) => {
          const a = answers[it.id] || {};
          return {
            itemId: it.id,
            label: it.label,
            kind: it.kind,
            score: it.kind === "rating" ? a.score ?? null : null,
            text: it.kind === "text" ? a.text ?? null : null,
            yesno: it.kind === "yesno" ? a.yesno ?? null : null,
          };
        })
      : [];
    const res = await fetch(`/api/interviews/${interviewId}/debrief`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pros: pros.trim() || null,
        cons: cons.trim() || null,
        sentiment,
        rating,
        recommend,
        kitId: activeKit ? activeKit.id : null,
        criteria,
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
        ref={dialogRef}
        className="sheet glass glass-strong sheet-md"
        role="dialog"
        aria-modal="true"
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
          {/* Interview kit — structured scorecard */}
          {kits.length > 0 && (
            <div style={{ marginBottom: activeKit ? 14 : 16 }}>
              <label className="label">Interview kit</label>
              <select
                className="select"
                value={kitId || ""}
                onChange={(e) => setKitId(e.target.value || null)}
                style={{ width: "100%" }}
              >
                <option value="">No kit — free-form notes</option>
                {kits.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                    {stageKey && k.stageKey === stageKey ? " (suggested)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeKit && (
            <div style={{ marginBottom: 18 }}>
              {activeKit.description && <p className="tiny muted" style={{ marginBottom: 10 }}>{activeKit.description}</p>}
              <div className="col" style={{ gap: 8 }}>
                {activeKit.items.map((it) => {
                  const a = answers[it.id] || {};
                  return (
                    <div
                      key={it.id}
                      style={{ padding: 12, border: "0.5px solid var(--line)", borderRadius: 10, background: "var(--glass-bg-faint)" }}
                    >
                      <div className="row" style={{ gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 550, flex: 1, minWidth: 0 }}>{it.label}</span>
                        {it.kind === "rating" && (
                          <Stars value={a.score ?? null} onChange={(n) => setAnswer(it.id, { score: n })} size={18} ariaLabel={it.label} />
                        )}
                        {it.kind === "yesno" && (
                          <div className="row" style={{ gap: 4 }}>
                            <button type="button" className="btn btn-sm" style={pickStyle(a.yesno === true)} onClick={() => setAnswer(it.id, { yesno: a.yesno === true ? null : true })}>
                              Yes
                            </button>
                            <button type="button" className="btn btn-sm" style={pickStyle(a.yesno === false)} onClick={() => setAnswer(it.id, { yesno: a.yesno === false ? null : false })}>
                              No
                            </button>
                          </div>
                        )}
                      </div>
                      {it.hint && <p className="tiny muted" style={{ margin: "4px 0 0" }}>{it.hint}</p>}
                      {it.kind === "text" && (
                        <textarea
                          className="input"
                          rows={2}
                          value={a.text || ""}
                          onChange={(e) => setAnswer(it.id, { text: e.target.value })}
                          placeholder="Notes…"
                          style={{ fontFamily: "inherit", marginTop: 8 }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
              <label className="label">Overall rating</label>
              <div className="row" style={{ gap: 8, height: 32 }}>
                <Stars value={rating} onChange={setRating} size={22} ariaLabel="Overall rating" />
                {rating !== null && (
                  <button type="button" onClick={() => setRating(null)} className="btn btn-sm btn-ghost" style={{ fontSize: 11 }}>
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
