// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import Link from "next/link";
import { Glass, Avatar, Icons, Chip, AIPill } from "@/components/primitives";

type Account = {
  id: string;
  provider: string;
  email: string;
  enabled: boolean;
  consecutiveErrors: number;
};

type Settings = {
  workHours: { start: string; end: string };
  workDays: number[];
  timezone: string;
  defaultInterviewKind: string;
};

type ApiEvent =
  | {
      source: "interview";
      id: string;
      startsAt: string;
      endsAt: string;
      kind: string;
      status: string;
      candidate: { id: string; name: string };
      job: { id: string; title: string };
      applicationId: string;
      participants: { id: string; name: string }[];
      meetingUrl: string | null;
      location: string | null;
      syncStatus: string;
    }
  | {
      source: "followup";
      id: string;
      startsAt: string;
      endsAt: string;
      kind: string;
      reason: string;
      candidate: { id: string; name: string };
      applicationId: string;
      state: string;
      ai: boolean;
    }
  | {
      source: "external";
      id: string;
      startsAt: string;
      endsAt: string;
      provider: string;
      title: string | null;
      url: string | null;
      location: string | null;
    };

type Mode = "day" | "week" | "agenda";
type Scope = "mine" | "team" | "workspace";

const KIND_COLORS: Record<string, { bg: string; ink: string; border: string }> = {
  phone: { bg: "color-mix(in oklab, oklch(76% 0.14 175) 22%, transparent)", ink: "oklch(38% 0.14 175)", border: "color-mix(in oklab, oklch(70% 0.14 175) 50%, transparent)" },
  video: { bg: "color-mix(in oklab, oklch(76% 0.14 240) 22%, transparent)", ink: "oklch(40% 0.18 240)", border: "color-mix(in oklab, oklch(70% 0.18 240) 50%, transparent)" },
  onsite: { bg: "color-mix(in oklab, oklch(78% 0.14 70) 22%, transparent)", ink: "oklch(45% 0.18 70)", border: "color-mix(in oklab, oklch(70% 0.16 70) 50%, transparent)" },
  panel: { bg: "color-mix(in oklab, oklch(78% 0.14 310) 22%, transparent)", ink: "oklch(45% 0.20 310)", border: "color-mix(in oklab, oklch(70% 0.18 310) 50%, transparent)" },
};

const FOLLOWUP_VERBS: Record<string, { verb: string; icon: keyof typeof Icons }> = {
  reply: { verb: "Reply to", icon: "Mail" },
  decide: { verb: "Decide on", icon: "Check" },
  send_rejection: { verb: "Send rejection", icon: "Send" },
  debrief: { verb: "Debrief", icon: "FileText" },
  reference: { verb: "References for", icon: "Lock" },
  nudge_offer: { verb: "Nudge offer", icon: "Heart" },
  ai_suggested: { verb: "Check in with", icon: "Sparkle" },
};

const KIND_LABELS: Record<string, string> = {
  phone: "Phone",
  video: "Video",
  onsite: "On-site",
  panel: "Panel",
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // ISO week starts Monday
  return addDays(x, diff);
}
function fmtHM(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function CalendarView({
  currentUser,
  workspace,
  accounts,
  settings,
}: {
  currentUser: { id: string; name: string; role: string };
  workspace: { id: string; name: string };
  accounts: Account[];
  settings: Settings;
}) {
  const [mode, setMode] = React.useState<Mode>("week");
  const [scope, setScope] = React.useState<Scope>(currentUser.role === "owner" || currentUser.role === "admin" ? "team" : "mine");
  const [anchor, setAnchor] = React.useState<Date>(() => startOfDay(new Date()));
  const [events, setEvents] = React.useState<ApiEvent[] | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [showInterview, setShowInterview] = React.useState(true);
  const [showFollowups, setShowFollowups] = React.useState(true);
  const [showBusy, setShowBusy] = React.useState(true);

  const range = React.useMemo(() => {
    if (mode === "day") return { from: anchor, to: addDays(anchor, 1) };
    if (mode === "agenda") return { from: anchor, to: addDays(anchor, 14) };
    const start = startOfWeek(anchor);
    return { from: start, to: addDays(start, 7) };
  }, [mode, anchor]);

  const fetchEvents = React.useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const types: string[] = [];
      if (showInterview) types.push("interview");
      if (showFollowups) types.push("followup");
      if (showBusy) types.push("external");
      const url = `/api/calendar/range?from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}&scope=${scope}&types=${types.join(",")}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { events: ApiEvent[] };
      setEvents(j.events);
    } catch (e) {
      setError((e as Error).message);
      setEvents([]);
    } finally {
      setRefreshing(false);
    }
  }, [range.from, range.to, scope, showInterview, showFollowups, showBusy]);

  React.useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const headerLabel = React.useMemo(() => {
    if (mode === "day") return range.from.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    if (mode === "agenda")
      return `${range.from.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${addDays(range.to, -1).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    const last = addDays(range.from, 6);
    return `${range.from.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${last.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }, [mode, range]);

  function step(direction: 1 | -1) {
    const unit = mode === "day" ? 1 : 7;
    setAnchor((cur) => addDays(cur, unit * direction));
  }

  const evs = events || [];
  const followUps = evs.filter((e) => e.source === "followup") as Extract<ApiEvent, { source: "followup" }>[];
  const interviews = evs.filter((e) => e.source === "interview") as Extract<ApiEvent, { source: "interview" }>[];
  const busy = evs.filter((e) => e.source === "external") as Extract<ApiEvent, { source: "external" }>[];

  const visibleDays = React.useMemo(() => {
    const days: Date[] = [];
    const n = mode === "day" ? 1 : 7;
    const start = mode === "day" ? anchor : startOfWeek(anchor);
    for (let i = 0; i < n; i++) days.push(addDays(start, i));
    return days;
  }, [mode, anchor]);

  return (
    <div className="page" style={{ height: "calc(100vh - 24px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Topbar */}
      <div className="row" style={{ padding: "10px 22px 14px", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="topbar-crumb">Time</div>
          <div className="topbar-title">Calendar</div>
        </div>
        <button className="iconbtn" onClick={() => step(-1)} title="Previous">
          <Icons.ChevronLeft size={14} />
        </button>
        <button
          className="btn btn-sm"
          onClick={() => setAnchor(startOfDay(new Date()))}
          title="Today"
          style={{ height: 30 }}
        >
          Today
        </button>
        <button className="iconbtn" onClick={() => step(1)} title="Next">
          <Icons.ChevronRight size={14} />
        </button>
        <div className="muted" style={{ minWidth: 220, textAlign: "center", fontSize: 13 }}>{headerLabel}</div>

        <div className="row" style={{ gap: 4, marginLeft: 8 }}>
          {(["day", "week", "agenda"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className="btn btn-sm"
              style={{
                height: 30,
                background: mode === m ? "var(--accent-solid)" : "var(--glass-bg-faint)",
                color: mode === m ? "white" : "var(--ink-1)",
                border: mode === m ? "0.5px solid transparent" : "0.5px solid var(--line)",
                textTransform: "capitalize",
              }}
            >
              {m}
            </button>
          ))}
        </div>

        <FilterMenu
          scope={scope}
          setScope={setScope}
          canSeeWorkspace={currentUser.role === "owner" || currentUser.role === "admin"}
          showInterview={showInterview}
          setShowInterview={setShowInterview}
          showFollowups={showFollowups}
          setShowFollowups={setShowFollowups}
          showBusy={showBusy}
          setShowBusy={setShowBusy}
        />

        <button
          className="btn btn-sm"
          onClick={fetchEvents}
          disabled={refreshing}
          title="Refresh"
          style={{ height: 30 }}
        >
          <Icons.Refresh size={12} /> {refreshing ? "…" : "Refresh"}
        </button>
      </div>

      {accounts.length === 0 && (
        <Glass faint style={{ margin: "0 22px 12px", padding: 12, borderRadius: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <Icons.Calendar size={16} style={{ color: "var(--accent-solid)" }} />
            <div style={{ flex: 1, fontSize: 13 }}>
              <strong>Connect a calendar</strong> so Vellum can show your existing meetings and stop suggesting times you're already booked.
            </div>
            <Link href="/settings?tab=calendar" className="btn btn-sm btn-primary">
              Connect
            </Link>
          </div>
        </Glass>
      )}

      {error && (
        <Glass faint style={{ margin: "0 22px 12px", padding: 12, borderRadius: 12, color: "oklch(58% 0.20 28)" }}>
          Failed to load calendar: {error}
        </Glass>
      )}

      {events !== null && events.length === 0 && accounts.length > 0 && (
        <Glass faint style={{ margin: "0 22px 12px", padding: 12, borderRadius: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <Icons.Calendar size={16} style={{ color: "var(--ink-2)" }} />
            <div style={{ flex: 1, fontSize: 13 }}>
              Nothing in this window. Your connected calendars are synced but
              this {mode === "day" ? "day" : mode === "week" ? "week" : "fortnight"} is empty —
              try {scope !== "workspace" && currentUser.role !== "member" ? "widening the scope filter, " : ""}stepping forward,
              or opening Settings → Calendar to confirm the right calendar is selected.
            </div>
          </div>
        </Glass>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 22px 22px" }}>
        {mode === "agenda" ? (
          <AgendaView interviews={interviews} followUps={followUps} busy={busy} />
        ) : (
          <GridView
            days={visibleDays}
            workHours={settings.workHours}
            interviews={interviews}
            followUps={followUps}
            busy={busy}
            onActionFollowUp={async (id, action) => {
              await fetch("/api/calendar/follow-ups", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, action }),
              });
              await fetchEvents();
            }}
            onMoveInterview={async (id, newStart) => {
              // Optimistic move: patch local state first so the block snaps
              // to the new slot without waiting on the server round-trip.
              // If the server rejects, the next fetchEvents() rolls it back.
              setEvents((prev) =>
                prev
                  ? prev.map((e) => {
                      if (e.source !== "interview" || e.id !== id) return e;
                      const oldStart = new Date(e.startsAt);
                      const oldEnd = new Date(e.endsAt);
                      const newEnd = new Date(newStart.getTime() + (oldEnd.getTime() - oldStart.getTime()));
                      return { ...e, startsAt: newStart.toISOString(), endsAt: newEnd.toISOString() };
                    })
                  : prev,
              );
              const r = await fetch(`/api/interviews/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ scheduledAt: newStart.toISOString() }),
              });
              await fetchEvents();
              if (!r.ok) {
                const j = await r.json().catch(() => ({}));
                setError(`Reschedule failed: ${j.error || `HTTP ${r.status}`}`);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

function FilterMenu(props: {
  scope: Scope;
  setScope: (s: Scope) => void;
  canSeeWorkspace: boolean;
  showInterview: boolean;
  setShowInterview: (b: boolean) => void;
  showFollowups: boolean;
  setShowFollowups: (b: boolean) => void;
  showBusy: boolean;
  setShowBusy: (b: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn btn-sm" onClick={() => setOpen((o) => !o)} style={{ height: 30 }}>
        <Icons.Filter size={12} /> Filter
      </button>
      {open && (
        <Glass strong style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, padding: 10, borderRadius: 10, minWidth: 220, zIndex: 30 }}>
          <div className="section-h" style={{ marginBottom: 4 }}>Scope</div>
          {(["mine", "team", "workspace"] as Scope[]).map((s) => {
            const disabled = s === "workspace" && !props.canSeeWorkspace;
            return (
              <label
                key={s}
                className="row"
                style={{
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 6,
                  fontSize: 13,
                  textTransform: "capitalize",
                  opacity: disabled ? 0.5 : 1,
                  cursor: disabled ? "not-allowed" : "default",
                }}
              >
                <input
                  type="radio"
                  name="scope"
                  checked={props.scope === s}
                  disabled={disabled}
                  onChange={() => props.setScope(s)}
                />
                <span>{s === "mine" ? "Just me" : s === "team" ? "My team" : "Whole workspace"}</span>
              </label>
            );
          })}
          <div className="divider" style={{ margin: "8px 0", borderTop: "0.5px solid var(--line)" }} />
          <div className="section-h" style={{ marginBottom: 4 }}>Show</div>
          <label className="row" style={{ gap: 8, padding: "6px 8px", borderRadius: 6, fontSize: 13 }}>
            <input type="checkbox" checked={props.showInterview} onChange={(e) => props.setShowInterview(e.target.checked)} />
            <span>Interviews</span>
          </label>
          <label className="row" style={{ gap: 8, padding: "6px 8px", borderRadius: 6, fontSize: 13 }}>
            <input type="checkbox" checked={props.showFollowups} onChange={(e) => props.setShowFollowups(e.target.checked)} />
            <span>Follow-ups</span>
          </label>
          <label className="row" style={{ gap: 8, padding: "6px 8px", borderRadius: 6, fontSize: 13 }}>
            <input type="checkbox" checked={props.showBusy} onChange={(e) => props.setShowBusy(e.target.checked)} />
            <span>External busy blocks</span>
          </label>
        </Glass>
      )}
    </div>
  );
}

function GridView({
  days,
  workHours,
  interviews,
  followUps,
  busy,
  onActionFollowUp,
  onMoveInterview,
}: {
  days: Date[];
  workHours: { start: string; end: string };
  interviews: Extract<ApiEvent, { source: "interview" }>[];
  followUps: Extract<ApiEvent, { source: "followup" }>[];
  busy: Extract<ApiEvent, { source: "external" }>[];
  onActionFollowUp: (id: string, action: "dismiss" | "done") => Promise<void>;
  onMoveInterview: (id: string, newStart: Date) => Promise<void>;
}) {
  // Expand the visible hour range when any event falls outside the
  // workspace's working hours. The spec calls for this — the grid
  // shouldn't silently hide a meeting at 7am or 9pm. We dim the off-hours
  // rows so the working window is still visually distinct.
  const baseStart = Number(workHours.start.split(":")[0]);
  const baseEnd = Number(workHours.end.split(":")[0]);

  const allLocalHours = [
    ...interviews.flatMap((iv) => [new Date(iv.startsAt).getHours(), new Date(iv.endsAt).getHours()]),
    ...busy.flatMap((b) => [new Date(b.startsAt).getHours(), new Date(b.endsAt).getHours()]),
  ];
  const minEvent = allLocalHours.length > 0 ? Math.min(...allLocalHours) : baseStart;
  const maxEvent = allLocalHours.length > 0 ? Math.max(...allLocalHours) + 1 : baseEnd;
  const startHour = Math.min(baseStart, minEvent);
  const endHour = Math.max(baseEnd, maxEvent);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const ROW_H = 56; // px per hour

  const followUpsByDay = days.map((d) => followUps.filter((f) => sameDay(new Date(f.startsAt), d)));

  return (
    <Glass className="card" style={{ padding: 0, overflow: "hidden", borderRadius: 12 }}>
      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: `48px repeat(${days.length}, 1fr)`, borderBottom: "0.5px solid var(--line)" }}>
        <div />
        {days.map((d, i) => {
          const isToday = sameDay(d, new Date());
          return (
            <div key={i} className="row" style={{ padding: "10px 12px", borderLeft: "0.5px solid var(--line)", justifyContent: "center", gap: 6 }}>
              <span className="tiny" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {d.toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: isToday ? "white" : "var(--ink-0)",
                  background: isToday ? "var(--accent-solid)" : "transparent",
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {d.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Follow-up strip */}
      {followUps.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `48px repeat(${days.length}, 1fr)`,
            borderBottom: "0.5px solid var(--line)",
            background: "var(--glass-bg-faint)",
          }}
        >
          <div className="tiny" style={{ padding: "8px 6px", textAlign: "right", color: "var(--ink-3)" }}>
            Follow-ups
          </div>
          {followUpsByDay.map((dayUps, i) => (
            <div key={i} style={{ padding: 6, borderLeft: "0.5px solid var(--line)", minHeight: 36, display: "flex", flexDirection: "column", gap: 4 }}>
              {dayUps.slice(0, 3).map((f) => (
                <FollowUpChip key={f.id} f={f} onAction={onActionFollowUp} />
              ))}
              {dayUps.length > 3 && (
                <div className="tiny" style={{ padding: "2px 6px", color: "var(--ink-3)" }}>
                  + {dayUps.length - 3} more
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Hour grid */}
      <div style={{ display: "grid", gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}>
        {/* Hours column */}
        <div style={{ borderRight: "0.5px solid var(--line)" }}>
          {hours.map((h) => (
            <div key={h} className="tiny" style={{ height: ROW_H, padding: "4px 6px", textAlign: "right", color: "var(--ink-3)", borderBottom: "0.5px solid var(--line)" }}>
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {/* Day columns */}
        {days.map((d, i) => {
          const dayInterviews = interviews.filter((iv) => sameDay(new Date(iv.startsAt), d));
          const dayBusy = busy.filter((b) => sameDay(new Date(b.startsAt), d));
          return (
            <div
              key={i}
              style={{ position: "relative", borderLeft: "0.5px solid var(--line)", minHeight: hours.length * ROW_H }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("text/vellum-interview")) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }
              }}
              onDrop={async (e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/vellum-interview");
                if (!id) return;
                // Map the drop Y position to a time. We snap to 15-minute
                // increments so a sloppy drop still lands on a sensible slot.
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const offsetY = e.clientY - rect.top;
                const hoursFromStart = offsetY / ROW_H;
                const totalMinutes = Math.round((hoursFromStart + startHour) * 60 / 15) * 15;
                const newStart = new Date(d);
                newStart.setHours(0, 0, 0, 0);
                newStart.setMinutes(totalMinutes);
                await onMoveInterview(id, newStart);
              }}
            >
              {hours.map((h) => {
                const offHours = h < baseStart || h >= baseEnd;
                return (
                  <div
                    key={h}
                    style={{
                      height: ROW_H,
                      borderBottom: "0.5px solid var(--line)",
                      background: offHours ? "color-mix(in oklab, var(--ink-3) 4%, transparent)" : undefined,
                    }}
                  />
                );
              })}
              {dayBusy.map((b) => (
                <BusyBlock key={b.id} b={b} startHour={startHour} rowH={ROW_H} totalHours={hours.length} />
              ))}
              {dayInterviews.map((iv) => (
                <InterviewBlock
                  key={iv.id}
                  iv={iv}
                  startHour={startHour}
                  rowH={ROW_H}
                  totalHours={hours.length}
                  onDragStart={() => {}}
                />
              ))}
            </div>
          );
        })}
      </div>
    </Glass>
  );
}

function FollowUpChip({
  f,
  onAction,
}: {
  f: Extract<ApiEvent, { source: "followup" }>;
  onAction: (id: string, action: "dismiss" | "done") => Promise<void>;
}) {
  const meta = FOLLOWUP_VERBS[f.kind] || FOLLOWUP_VERBS.reply;
  const Ico = Icons[meta.icon];
  const overdue = new Date(f.startsAt) < new Date();
  return (
    <div
      className="row"
      title={f.reason}
      style={{
        gap: 4,
        padding: "3px 7px",
        borderRadius: 6,
        background: f.ai ? "color-mix(in oklab, var(--accent-solid) 12%, transparent)" : "var(--glass-bg)",
        border: f.ai ? "0.5px solid color-mix(in oklab, var(--accent-solid) 40%, transparent)" : "0.5px solid var(--line)",
        color: overdue ? "oklch(58% 0.20 28)" : "var(--ink-0)",
        fontSize: 11,
        fontWeight: 500,
        cursor: "default",
      }}
    >
      {f.ai && <AIPill>AI</AIPill>}
      {!f.ai && <Ico size={11} />}
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {meta.verb} {f.candidate.name.split(" ")[0]}
      </span>
      <button
        type="button"
        onClick={() => onAction(f.id, "done")}
        title="Mark done"
        style={{ background: "none", border: 0, padding: 0, cursor: "default", color: "var(--ink-3)" }}
      >
        <Icons.Check size={11} />
      </button>
      <button
        type="button"
        onClick={() => onAction(f.id, "dismiss")}
        title="Dismiss"
        style={{ background: "none", border: 0, padding: 0, cursor: "default", color: "var(--ink-3)" }}
      >
        <Icons.X size={11} />
      </button>
    </div>
  );
}

function InterviewBlock({
  iv,
  startHour,
  rowH,
  totalHours,
  onDragStart,
}: {
  iv: Extract<ApiEvent, { source: "interview" }>;
  startHour: number;
  rowH: number;
  totalHours: number;
  onDragStart: (id: string, durationMin: number) => void;
}) {
  const colors = KIND_COLORS[iv.kind] || KIND_COLORS.video;
  const start = new Date(iv.startsAt);
  const end = new Date(iv.endsAt);
  const durationMin = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60_000));
  const startOffset = start.getHours() + start.getMinutes() / 60;
  const endOffset = end.getHours() + end.getMinutes() / 60;
  const top = Math.max(0, (startOffset - startHour) * rowH);
  const rawHeight = (Math.min(endOffset, startHour + totalHours) - Math.max(startOffset, startHour)) * rowH;
  const height = Math.max(28, rawHeight);

  // An interview is "concluded" if it's already happened OR a debrief was
  // captured OR the recruiter explicitly closed it (done/cancelled/no_show).
  // Concluded interviews don't move — moving them would mean rewriting
  // history, which silently breaks debriefs, activity log and Pulse signals.
  const now = Date.now();
  const isPast = end.getTime() <= now;
  const isTerminalStatus = iv.status === "done" || iv.status === "cancelled" || iv.status === "no_show";
  const concluded = isPast || isTerminalStatus;

  const concludedLabel =
    iv.status === "cancelled"
      ? "Cancelled · can't be moved"
      : iv.status === "no_show"
        ? "No-show · can't be moved"
        : iv.status === "done"
          ? "Concluded · can't be moved"
          : "Already happened · can't be moved";

  return (
    <Link
      href={`/candidates/${iv.candidate.id}`}
      draggable={!concluded}
      onDragStart={
        concluded
          ? undefined
          : (e) => {
              e.dataTransfer.setData("text/vellum-interview", iv.id);
              e.dataTransfer.setData("text/vellum-duration", String(durationMin));
              e.dataTransfer.effectAllowed = "move";
              onDragStart(iv.id, durationMin);
            }
      }
      style={{
        position: "absolute",
        top,
        left: 4,
        right: 4,
        height,
        borderRadius: 8,
        background: colors.bg,
        border: `0.5px ${iv.status === "cancelled" ? "dashed" : "solid"} ${colors.border}`,
        color: colors.ink,
        padding: "6px 8px",
        textDecoration: iv.status === "cancelled" ? "line-through" : "none",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        // Concluded interviews are visually quieted but stay readable; cancelled
        // ones get a stronger fade because the row is informational only.
        opacity: iv.status === "cancelled" ? 0.45 : isPast || isTerminalStatus ? 0.65 : 1,
        cursor: concluded ? "default" : "grab",
      }}
      title={concluded ? concludedLabel : "Drag to a new slot to reschedule, or click to open the candidate."}
    >
      <div className="row" style={{ gap: 4 }}>
        <Avatar name={iv.candidate.name} size="sm" />
        <span style={{ fontSize: 12, fontWeight: 600, color: colors.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
          {iv.candidate.name}
        </span>
        {iv.syncStatus === "error" && (
          <span title="Calendar sync failed — re-open settings" style={{ color: "oklch(58% 0.20 28)" }}>!</span>
        )}
      </div>
      <div className="tiny" style={{ color: colors.ink, opacity: 0.85 }}>
        {KIND_LABELS[iv.kind] || iv.kind} · {fmtHM(start)}–{fmtHM(end)}
      </div>
      <div className="tiny" style={{ color: colors.ink, opacity: 0.7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {iv.job.title}
      </div>
    </Link>
  );
}

function BusyBlock({
  b,
  startHour,
  rowH,
  totalHours,
}: {
  b: Extract<ApiEvent, { source: "external" }>;
  startHour: number;
  rowH: number;
  totalHours: number;
}) {
  const start = new Date(b.startsAt);
  const end = new Date(b.endsAt);
  // Local-clock hours so the block lines up with the labels on the left
  // gutter regardless of the browser TZ vs. event TZ.
  const startOffset = start.getHours() + start.getMinutes() / 60;
  const endOffset = end.getHours() + end.getMinutes() / 60;
  // Clip so events that straddle midnight don't overflow the column.
  const top = Math.max(0, (startOffset - startHour) * rowH);
  const rawHeight = (Math.min(endOffset, startHour + totalHours) - Math.max(startOffset, startHour)) * rowH;
  const height = Math.max(20, rawHeight);
  return (
    <div
      title={`${b.title || "(no title)"} · ${b.provider}${b.location ? ` · ${b.location}` : ""}`}
      style={{
        position: "absolute",
        top,
        left: 2,
        right: 2,
        height,
        borderRadius: 6,
        backgroundImage: "repeating-linear-gradient(135deg, color-mix(in oklab, var(--ink-3) 35%, transparent) 0 2px, transparent 2px 8px)",
        backgroundColor: "color-mix(in oklab, var(--ink-3) 10%, transparent)",
        border: "0.5px dashed color-mix(in oklab, var(--ink-3) 40%, transparent)",
        pointerEvents: "auto",
        fontSize: 11,
        color: "var(--ink-1)",
        padding: "4px 6px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {b.title || "(no title)"}
      </div>
      <div className="tiny" style={{ color: "var(--ink-3)" }}>
        {fmtHM(start)}–{fmtHM(end)} · {b.provider}
      </div>
    </div>
  );
}

function AgendaView({
  interviews,
  followUps,
  busy,
}: {
  interviews: Extract<ApiEvent, { source: "interview" }>[];
  followUps: Extract<ApiEvent, { source: "followup" }>[];
  busy: Extract<ApiEvent, { source: "external" }>[];
}) {
  const all: { date: Date; el: React.ReactNode; key: string }[] = [];
  for (const iv of interviews) {
    const date = new Date(iv.startsAt);
    all.push({
      date,
      key: `i-${iv.id}`,
      el: (
        <Link href={`/candidates/${iv.candidate.id}`} className="row" style={{ gap: 12, padding: "10px 12px", textDecoration: "none", color: "inherit", borderBottom: "0.5px solid var(--line)" }}>
          <div className="tiny" style={{ width: 80, color: "var(--ink-3)" }}>
            {fmtHM(date)}
          </div>
          <Chip dot="var(--accent-solid)">{KIND_LABELS[iv.kind] || iv.kind}</Chip>
          <Avatar name={iv.candidate.name} size="sm" />
          <div style={{ flex: 1, fontSize: 13 }}>
            <div style={{ fontWeight: 500 }}>{iv.candidate.name}</div>
            <div className="tiny">{iv.job.title}</div>
          </div>
          <Icons.ChevronRight size={12} style={{ color: "var(--ink-3)" }} />
        </Link>
      ),
    });
  }
  for (const f of followUps) {
    const date = new Date(f.startsAt);
    const meta = FOLLOWUP_VERBS[f.kind] || FOLLOWUP_VERBS.reply;
    const Ico = Icons[meta.icon];
    all.push({
      date,
      key: `f-${f.id}`,
      el: (
        <div className="row" style={{ gap: 12, padding: "10px 12px", borderBottom: "0.5px solid var(--line)" }}>
          <div className="tiny" style={{ width: 80, color: "var(--ink-3)" }}>
            {fmtHM(date)}
          </div>
          {f.ai ? <AIPill>AI</AIPill> : <Ico size={13} />}
          <div style={{ flex: 1, fontSize: 13 }}>
            <div style={{ fontWeight: 500 }}>
              {meta.verb} {f.candidate.name}
            </div>
            <div className="tiny" style={{ color: "var(--ink-2)" }}>{f.reason}</div>
          </div>
        </div>
      ),
    });
  }
  for (const b of busy) {
    const date = new Date(b.startsAt);
    all.push({
      date,
      key: `b-${b.id}`,
      el: (
        <div className="row" style={{ gap: 12, padding: "10px 12px", borderBottom: "0.5px solid var(--line)", opacity: 0.7 }}>
          <div className="tiny" style={{ width: 80, color: "var(--ink-3)" }}>
            {fmtHM(date)}
          </div>
          <Chip>Busy · {b.provider}</Chip>
          <div className="muted" style={{ flex: 1, fontSize: 13 }}>{b.title || "(no title)"}</div>
        </div>
      ),
    });
  }
  all.sort((a, b) => a.date.getTime() - b.date.getTime());

  if (all.length === 0) {
    return (
      <Glass faint style={{ padding: 36, borderRadius: 12, textAlign: "center" }}>
        <p className="muted">Nothing scheduled in this window.</p>
      </Glass>
    );
  }

  // Group by day for nicer headers.
  const groups: { date: Date; items: typeof all }[] = [];
  for (const it of all) {
    const head = groups[groups.length - 1];
    if (head && sameDay(head.date, it.date)) head.items.push(it);
    else groups.push({ date: it.date, items: [it] });
  }

  return (
    <Glass className="card" style={{ padding: 0, borderRadius: 12, overflow: "hidden" }}>
      {groups.map((g, gi) => (
        <div key={gi}>
          <div style={{ padding: "8px 12px", background: "var(--glass-bg-faint)", borderBottom: "0.5px solid var(--line)" }}>
            <span className="section-h">
              {g.date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            </span>
          </div>
          {g.items.map((it) => (
            <React.Fragment key={it.key}>{it.el}</React.Fragment>
          ))}
        </div>
      ))}
    </Glass>
  );
}
