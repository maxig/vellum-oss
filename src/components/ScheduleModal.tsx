// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import { Glass, Avatar, Icons } from "@/components/primitives";
import Wysiwyg from "@/components/Wysiwyg";
import { markdownToHtml } from "@/lib/markdown";
import { useDialogA11y } from "@/components/useDialogA11y";

// Interview types — icon + default duration. Matches view-schedule.jsx's
// "Type" card grid (Phone / Video / On-site / Panel).
const TYPES: { id: string; label: string; minutes: number; icon: keyof typeof Icons }[] = [
  { id: "phone",  label: "Phone screen", minutes: 30, icon: "Phone" },
  { id: "video",  label: "Video call",   minutes: 45, icon: "Globe" },
  { id: "onsite", label: "On-site",      minutes: 60, icon: "Users" },
  { id: "panel",  label: "Panel",        minutes: 60, icon: "Pipeline" },
];

const SLOTS = [
  "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30",
];


// How many weeks the day picker spans. Each "step" of the prev/next controls
// shifts the visible window by 7 days. Six weeks covers the bulk of "scheduled
// in the next month or so" without producing an unwieldy ribbon.
const MAX_WEEKS_AHEAD = 6;

type Member = { id: string; name: string; email: string };

export default function ScheduleModal({
  candidate,
  applicationId,
  jobTitle,
  onClose,
  onDone,
}: {
  candidate: { id: string; name: string };
  applicationId: string;
  jobTitle: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [type, setType] = React.useState("video");
  const [duration, setDuration] = React.useState(45);
  // `weekStart` is the offset in weeks from "today's week". Each step is +7d.
  const [weekStart, setWeekStart] = React.useState(0);
  // `dayOffset` is the absolute day index from today (0 = today).
  const [dayOffset, setDayOffset] = React.useState(2);
  const [slot, setSlot] = React.useState("14:00");
  const [members, setMembers] = React.useState<Member[]>([]);
  const [pickedIds, setPickedIds] = React.useState<string[]>([]);
  const [agenda, setAgenda] = React.useState("");
  // Free-form physical location ("Berlin office · 4th floor") and an optional
  // video meeting URL. The .ics generator prefers `meetingUrl` when present —
  // most calendar apps render it as a clickable JOIN button.
  const [location, setLocation] = React.useState("");
  const [meetingUrl, setMeetingUrl] = React.useState("");
  const [sendNow, setSendNow] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [aiBusy, setAiBusy] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef);
  // Real busy windows pulled from connected calendars + Vellum's own
  // scheduled interviews. The slot-grid below cross-references this list
  // to determine the line-through state. Replaces the hard-coded demo list.
  const [busyRanges, setBusyRanges] = React.useState<{ startsAt: string; endsAt: string; source: string; provider?: string }[]>([]);

  // Fetch workspace members once so we can render real teammates instead of
  // a hard-coded list. Failure is silent — the picker just stays empty.
  React.useEffect(() => {
    let alive = true;
    fetch("/api/workspace/members")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j) => {
        if (!alive) return;
        const list: Member[] = (j.members || []).map((m: any) => ({
          id: m.id,
          name: m.name || m.email,
          email: m.email,
        }));
        setMembers(list);
        // Deliberately do NOT pre-select anyone — the previous behaviour of
        // auto-picking the first member (alphabetically that's usually
        // `admin@vellum.local` on a fresh install) silently CC'd the seed
        // admin on every invite the recruiter sent. Let the user opt in.
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // ── Date helpers ────────────────────────────────────────────────────────
  // Today, normalised to midnight so the offset math doesn't drift across
  // timezone DST boundaries within a render.
  const today = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const visibleDays = React.useMemo(() => {
    const startOffset = weekStart * 7;
    return Array.from({ length: 7 }, (_, i) => {
      const offset = startOffset + i;
      const d = new Date(today);
      d.setDate(today.getDate() + offset);
      return { offset, date: d, isWeekend: d.getDay() === 0 || d.getDay() === 6 };
    });
  }, [today, weekStart]);

  const selectedDate = React.useMemo(() => {
    const d = new Date(today);
    d.setDate(today.getDate() + dayOffset);
    return d;
  }, [dayOffset, today]);

  // Pull free/busy for the visible day — the slot-picker uses it to mark
  // conflicts. We fetch a 24h window and intersect client-side; cheap enough
  // and means changing the duration doesn't re-fire the request.
  React.useEffect(() => {
    const from = new Date(selectedDate);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    let alive = true;
    fetch(`/api/calendar/free-busy?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j) => {
        if (!alive) return;
        setBusyRanges(j.busy || []);
      })
      .catch(() => {
        // Silent fallback — slot-picker degrades to "no conflicts shown".
        setBusyRanges([]);
      });
    return () => {
      alive = false;
    };
  }, [selectedDate]);

  // Detect whether a slot's [start, start+duration) overlaps any busy
  // window. We use the picked duration so a 60-min on-site picks up an
  // adjacent 30-min busy block that a 30-min phone screen would miss.
  function isConflict(slot: string): { conflict: boolean; provider?: string } {
    const [h, m] = slot.split(":").map(Number);
    const start = new Date(selectedDate);
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + duration * 60_000);
    for (const r of busyRanges) {
      const bs = new Date(r.startsAt);
      const be = new Date(r.endsAt);
      if (bs < end && be > start) {
        return { conflict: true, provider: r.provider };
      }
    }
    return { conflict: false };
  }

  const tz = React.useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "UTC";
    }
  }, []);

  const pickedMembers = members.filter((m) => pickedIds.includes(m.id));
  const typeMeta = TYPES.find((t) => t.id === type) || TYPES[0];

  function toggleMember(id: string) {
    setPickedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function suggestAgenda() {
    setAiBusy(true);
    try {
      const r = await fetch("/api/ai/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system:
            "You write short, focused interview agendas for a recruiting team. Output 3 bullets max, plain text, no preamble, no closing pleasantries.",
          prompt: `Write a ${typeMeta.minutes}-minute ${typeMeta.label.toLowerCase()} agenda with ${candidate.name} for the ${jobTitle} role.`,
          maxTokens: 200,
        }),
      });
      const j = await r.json().catch(() => null);
      if (j?.text) setAgenda(markdownToHtml(j.text));
    } catch {
      /* swallow — Suggest is a nice-to-have, not a blocker */
    } finally {
      setAiBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    const [h, m] = slot.split(":").map(Number);
    const d = new Date(selectedDate);
    d.setHours(h, m, 0, 0);
    try {
      const res = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          kind: type,
          scheduledAt: d.toISOString(),
          durationMin: duration,
          agenda,
          location: location.trim() || null,
          meetingUrl: meetingUrl.trim() || null,
          // Send the user IDs only — the server resolves names + emails
          // for the candidate-facing invite, validates membership, and
          // creates InterviewParticipant rows.
          interviewerIds: pickedIds,
          sendNow,
        }),
      }).catch(() => null);
      // Only close on success — previously onDone() ran in `finally`, so a
      // failed POST closed the modal as if the interview had been booked.
      if (!res?.ok) {
        const j = await res?.json().catch(() => ({}));
        setError(j?.error || "Couldn't schedule the interview. Please try again.");
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const weekLabel = `${visibleDays[0].date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${visibleDays[6].date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
  const firstName = candidate.name.split(" ")[0];
  const interviewerLabel =
    pickedMembers.length === 0
      ? "the hiring team"
      : pickedMembers.length === 1
      ? pickedMembers[0].name
      : `${pickedMembers
          .slice(0, -1)
          .map((m) => m.name.split(" ")[0])
          .join(", ")} and ${pickedMembers[pickedMembers.length - 1].name.split(" ")[0]}`;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div
        ref={dialogRef}
        className="sheet glass glass-strong schedule-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Schedule interview with ${candidate.name}`}
        style={{
          width: "min(820px, calc(100vw - 48px))",
          height: "auto",
          maxHeight: "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div className="row" style={{ padding: "16px 22px", borderBottom: "0.5px solid var(--line)", gap: 12 }}>
          <Avatar name={candidate.name} size="md" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="topbar-crumb">Schedule with</div>
            <div className="topbar-title">{candidate.name}</div>
            {jobTitle && <div className="tiny" style={{ marginTop: 2 }}>{jobTitle}</div>}
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            <Icons.X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="scroll" style={{ flex: 1, padding: "22px 26px", overflowY: "auto" }}>
          {/* Type */}
          <div className="section-h" style={{ marginBottom: 8 }}>Type</div>
          <div className="row" style={{ gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
            {TYPES.map((t) => {
              const I = Icons[t.icon];
              const sel = type === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setType(t.id);
                    setDuration(t.minutes);
                  }}
                  className="btn"
                  style={{
                    flexDirection: "column",
                    alignItems: "flex-start",
                    padding: "12px 14px",
                    height: "auto",
                    gap: 4,
                    flex: "1 1 140px",
                    background: sel ? "var(--accent-soft)" : "var(--glass-bg-faint)",
                    border: "0.5px solid " + (sel ? "var(--accent-solid)" : "var(--line)"),
                    color: sel ? "var(--accent-solid)" : "var(--ink-0)",
                  }}
                >
                  <div className="row" style={{ gap: 6 }}>
                    <I size={14} />
                    <span style={{ fontWeight: 500 }}>{t.label}</span>
                  </div>
                  <span className="tiny">{t.minutes} min</span>
                </button>
              );
            })}
          </div>

          {/* Day — paginated by week so the recruiter can schedule out a
              month-plus into the future, not just the next 7 days. */}
          <div className="row" style={{ marginBottom: 8, gap: 8, alignItems: "center" }}>
            <div className="section-h" style={{ flex: 1 }}>Day</div>
            <span className="tiny" style={{ color: "var(--ink-2)" }}>{weekLabel}</span>
            <button
              type="button"
              className="iconbtn"
              style={{ width: 26, height: 26 }}
              onClick={() => setWeekStart((w) => Math.max(0, w - 1))}
              disabled={weekStart === 0}
              aria-label="Previous week"
              title="Previous week"
            >
              <Icons.ChevronLeft size={13} />
            </button>
            <button
              type="button"
              className="iconbtn"
              style={{ width: 26, height: 26 }}
              onClick={() => setWeekStart((w) => Math.min(MAX_WEEKS_AHEAD - 1, w + 1))}
              disabled={weekStart >= MAX_WEEKS_AHEAD - 1}
              aria-label="Next week"
              title="Next week"
            >
              <Icons.ChevronRight size={13} />
            </button>
            <span className="tiny" style={{ marginLeft: 6, color: "var(--ink-3)" }}>
              {tz}
            </span>
          </div>
          <div className="row" style={{ gap: 6, marginBottom: 18, overflowX: "auto", paddingBottom: 2 }}>
            {visibleDays.map(({ offset, date, isWeekend }) => {
              const sel = dayOffset === offset;
              const isPast = offset < 0;
              return (
                <button
                  key={offset}
                  type="button"
                  onClick={() => !isPast && setDayOffset(offset)}
                  disabled={isPast}
                  className="btn"
                  style={{
                    flexDirection: "column",
                    padding: "8px 12px",
                    width: 68,
                    height: 72,
                    gap: 2,
                    background: sel
                      ? "linear-gradient(135deg, var(--accent-1), var(--accent-2))"
                      : "var(--glass-bg-faint)",
                    border: "0.5px solid " + (sel ? "rgba(255,255,255,0.25)" : "var(--line)"),
                    color: sel
                      ? "white"
                      : isPast
                      ? "var(--ink-3)"
                      : isWeekend
                      ? "var(--ink-3)"
                      : "var(--ink-0)",
                    flexShrink: 0,
                    opacity: isPast ? 0.5 : 1,
                  }}
                >
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.85 }}>
                    {date.toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>
                    {date.getDate()}
                  </span>
                  <span style={{ fontSize: 9, opacity: 0.7 }}>
                    {date.toLocaleDateString(undefined, { month: "short" })}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Slot */}
          <div className="section-h" style={{ marginBottom: 8 }}>Time</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(74px, 1fr))",
              gap: 6,
              marginBottom: 22,
            }}
          >
            {SLOTS.map((s) => {
              const sel = slot === s;
              const { conflict, provider } = isConflict(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => !conflict && setSlot(s)}
                  disabled={conflict}
                  className="btn"
                  style={{
                    height: 34,
                    fontSize: 12.5,
                    padding: 0,
                    background: sel ? "var(--accent-solid)" : "var(--glass-bg-faint)",
                    border: "0.5px solid " + (sel ? "transparent" : "var(--line)"),
                    color: sel ? "white" : conflict ? "var(--ink-3)" : "var(--ink-0)",
                    cursor: conflict ? "not-allowed" : "default",
                    textDecoration: conflict ? "line-through" : "none",
                  }}
                  title={conflict ? `Conflict${provider ? ` · ${provider}` : ""}` : undefined}
                >
                  {s}
                </button>
              );
            })}
          </div>

          {/* Interviewers */}
          <div className="section-h" style={{ marginBottom: 8 }}>Interviewers</div>
          {members.length === 0 ? (
            <p className="tiny" style={{ marginBottom: 22, color: "var(--ink-2)" }}>
              No teammates yet — invite someone from <span className="mono">Settings → Team</span> first.
            </p>
          ) : (
            <div className="row" style={{ gap: 6, marginBottom: 22, flexWrap: "wrap" }}>
              {members.map((m) => {
                const sel = pickedIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMember(m.id)}
                    className="btn btn-sm"
                    style={{
                      paddingLeft: 4,
                      paddingRight: 10,
                      gap: 6,
                      background: sel ? "var(--accent-soft)" : "var(--glass-bg-faint)",
                      border:
                        "0.5px solid " +
                        (sel ? "color-mix(in oklab, var(--accent-solid) 35%, transparent)" : "var(--line)"),
                      color: sel ? "var(--accent-solid)" : "var(--ink-1)",
                    }}
                    title={m.email}
                  >
                    <Avatar name={m.name} size="sm" />
                    <span>{m.name}</span>
                    {sel && <Icons.Check size={11} stroke={2.4} />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Location & meeting link — placed before Agenda because the
              calendar invite's "where" field is more important than the
              optional prep notes. */}
          <div className="section-h" style={{ marginBottom: 8 }}>Where</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 22 }}>
            <div>
              <input
                className="input"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="Meeting link · https://meet…"
                type="url"
              />
              <p className="tiny" style={{ marginTop: 4, color: "var(--ink-2)" }}>
                Becomes the calendar event's URL — most apps render it as a Join button.
              </p>
            </div>
            <div>
              <input
                className="input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={type === "onsite" ? "Berlin office · 4th floor" : "Optional physical location"}
              />
              <p className="tiny" style={{ marginTop: 4, color: "var(--ink-2)" }}>
                Shown to the candidate and added to the calendar invite.
              </p>
            </div>
          </div>

          {/* Agenda */}
          <div className="row" style={{ marginBottom: 6 }}>
            <div className="section-h" style={{ flex: 1 }}>Agenda</div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={suggestAgenda}
              disabled={aiBusy}
            >
              <Icons.Sparkle size={11} stroke={2} /> {aiBusy ? "Suggesting…" : "Suggest"}
            </button>
          </div>
          <div style={{ marginBottom: 18 }}>
            <Wysiwyg
              value={agenda}
              onChange={setAgenda}
              placeholder="What we'll cover, any prep notes for the candidate…"
              minHeight={110}
            />
          </div>

          {/* Email preview */}
          <Glass faint style={{ padding: 14, borderRadius: 12, marginBottom: 12 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <Icons.Mail size={13} style={{ color: "var(--ink-2)" }} />
              <span className="tiny" style={{ flex: 1, marginLeft: 6 }}>
                Email preview · sent to {firstName}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-1)", lineHeight: 1.55 }}>
              Hi {firstName} — confirming our {typeMeta.label.toLowerCase()} on{" "}
              <b style={{ color: "var(--ink-0)" }}>
                {selectedDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </b>{" "}
              at <b style={{ color: "var(--ink-0)" }}>{slot}</b>. You'll meet with {interviewerLabel}.{" "}
              {meetingUrl.trim() ? (
                <>
                  Join link:{" "}
                  <span className="mono" style={{ color: "var(--accent-solid)" }}>
                    {meetingUrl.trim()}
                  </span>
                  .{" "}
                </>
              ) : location.trim() ? (
                <>
                  Where: <b style={{ color: "var(--ink-0)" }}>{location.trim()}</b>.{" "}
                </>
              ) : null}
              An .ics calendar invite is attached.
            </div>
          </Glass>

          {/* Send toggle */}
          <div
            className="row"
            style={{
              gap: 10,
              padding: "10px 14px",
              border: "0.5px solid var(--line)",
              borderRadius: 10,
              background: "var(--glass-bg-faint)",
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Send calendar invite + email now</div>
              <div className="tiny" style={{ marginTop: 2 }}>
                If off, the meeting saves as a draft you can review.
              </div>
            </div>
            <button
              type="button"
              className={`switch ${sendNow ? "on" : ""}`}
              onClick={() => setSendNow(!sendNow)}
              aria-label="Send calendar invite + email now"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="row" style={{ padding: "12px 22px", borderTop: "0.5px solid var(--line)", gap: 8 }}>
          <span className="tiny" style={{ flex: 1, color: error ? "oklch(60% 0.18 28)" : "var(--ink-2)" }} role={error ? "alert" : undefined}>
            {error
              ? error
              : `${typeMeta.label} · ${duration} min · ${selectedDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} ${slot} · ${pickedMembers.length} interviewer${pickedMembers.length === 1 ? "" : "s"}`}
          </span>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-sm btn-primary" onClick={save} disabled={busy}>
            <Icons.Calendar size={11} /> {busy ? "Scheduling…" : "Schedule"}
          </button>
        </div>
      </div>
    </>
  );
}
