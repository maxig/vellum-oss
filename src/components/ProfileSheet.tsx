// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import { Glass, Chip, Avatar, AIPill, RingScore, Icons } from "@/components/primitives";
import { relativeTime } from "@/lib/utils";
import ScheduleModal from "@/components/ScheduleModal";
import DebriefModal from "@/components/DebriefModal";
import CvViewer from "@/components/CvViewer";
import Wysiwyg from "@/components/Wysiwyg";
import RichText from "@/components/RichText";
import PulsePanel from "@/components/PulsePanel";
import { stripHtml } from "@/lib/sanitize";

// ─── Types ────────────────────────────────────────────────────────────
export type SheetStage = { id: string; key: string; name: string; color: string };
type SheetApplication = {
  id: string;
  jobId: string;
  jobTitle: string;
  jobSlug: string;
  department: string | null;
  location: string | null;
  stageId: string | null;
  stageKey: string | null;
  stageName: string;
  stageColor: string;
  aiFit: number | null;
  aiSummary: string | null;
  reviewerId: string | null;
  resumeUrl: string | null;
  resumeName: string | null;
  resumeText: string | null;
  whyUs: string | null;
  screeningQuestions: { id: string; label: string; kind: string }[];
  screeningAnswers: Record<string, unknown>;
  archived: boolean;
  appliedAt: string;
  updatedAt: string;
};
type SheetCandidate = {
  id: string;
  name: string;
  email: string | null;
  location: string | null;
  linkedin: string | null;
  portfolio: string | null;
  github: string | null;
  currentRole: string | null;
  years: number | null;
  source: string | null;
  skills: string[];
  createdAt: string;
};
type SheetThread = {
  id: string;
  subject: string;
  messages: { id: string; direction: string; body: string; fromName: string | null; createdAt: string }[];
};
type SheetData = {
  application: SheetApplication;
  candidate: SheetCandidate;
  otherApplications: { id: string; jobId: string; jobTitle: string; stageName: string; stageColor: string; appliedAt: string; archived: boolean }[];
  interviews: {
    id: string;
    kind: string;
    scheduledAt: string;
    durationMin: number;
    agenda: string | null;
    meetingUrl: string | null;
    location: string | null;
    /** Now resolved from InterviewParticipant join — each entry is a
     * workspace user with at minimum an id + display name. */
    interviewers: { id: string; name: string }[];
    /** Debrief written by an interviewer afterward. Null until somebody
     * submits one. See task 17 for the write UI. */
    debrief: {
      id: string;
      pros: string | null;
      cons: string | null;
      sentiment: string;
      rating: number | null;
      recommend: string | null;
      authorId: string;
      authorName: string;
      updatedAt: string;
    } | null;
    status: string;
  }[];
  notes: { id: string; body: string; author: string; createdAt: string }[];
  thread: SheetThread | null;
  activity: { id: string; kind: string; body: string; icon: string; actorName: string | null; createdAt: string }[];
};

type Tab = "overview" | "resume" | "communication" | "timeline";

// ─── Main component ───────────────────────────────────────────────────
export default function ProfileSheet({
  applicationId,
  stages,
  currentUser,
  currentRole,
  onClose,
  onChanged,
}: {
  applicationId: string;
  stages: SheetStage[];
  currentUser: { id: string; name: string; signature: string };
  currentRole?: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const canDelete = currentRole === "owner" || currentRole === "admin";
  const [data, setData] = React.useState<SheetData | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>("overview");
  const [aiBusy, setAiBusy] = React.useState(false);
  const [scheduling, setScheduling] = React.useState(false);
  const [stageBusy, setStageBusy] = React.useState(false);
  const [noteText, setNoteText] = React.useState("");
  const [noteBusy, setNoteBusy] = React.useState(false);
  // Lazily-loaded workspace member directory — fed to the reviewer
  // picker and (later) the interview interviewer picker. Cached at the
  // component level so we don't re-fetch on every interview row render.
  const [members, setMembers] = React.useState<{ id: string; name: string; email: string }[] | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace/members", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.members) setMembers(j.members);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [applicationId]);
  const [toast, setToast] = React.useState<string | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [debriefingId, setDebriefingId] = React.useState<string | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const load = React.useCallback(async () => {
    setLoadError(null);
    const res = await fetch(`/api/applications/${applicationId}/sheet`, { cache: "no-store" }).catch(() => null);
    if (!res) {
      setLoadError("Could not load applicant.");
      return;
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setLoadError(j?.error || "Could not load applicant.");
      return;
    }
    const json = (await res.json()) as SheetData;
    setData(json);
  }, [applicationId]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !scheduling) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, scheduling]);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast((c) => (c === message ? null : c)), 2400);
  }

  async function setReviewer(nextId: string | null) {
    if (!data) return;
    const previous = data.application.reviewerId;
    if (previous === nextId) return;
    // Optimistic — flip the picker immediately, roll back on failure.
    setData({ ...data, application: { ...data.application, reviewerId: nextId } });
    const res = await fetch(`/api/applications/${data.application.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewerId: nextId }),
    }).catch(() => null);
    if (!res?.ok) {
      setData((current) =>
        current ? { ...current, application: { ...current.application, reviewerId: previous } } : current,
      );
      flash("Could not change reviewer.");
      return;
    }
    flash(nextId ? "Reviewer updated." : "Reviewer cleared.");
    onChanged?.();
  }

  async function moveStage(stageId: string) {
    if (!data || stageBusy) return;
    const previous = data.application.stageId;
    if (previous === stageId) return;
    setStageBusy(true);
    const stage = stages.find((s) => s.id === stageId);
    setData({
      ...data,
      application: { ...data.application, stageId, stageName: stage?.name || data.application.stageName, stageColor: stage?.color || data.application.stageColor, stageKey: stage?.key || data.application.stageKey },
    });
    const res = await fetch(`/api/applications/${data.application.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId }),
    }).catch(() => null);
    setStageBusy(false);
    if (!res?.ok) {
      setData((current) => current ? { ...current, application: { ...current.application, stageId: previous } } : current);
      flash("Could not move stage.");
      return;
    }
    flash(`Moved to ${stage?.name || "stage"}.`);
    onChanged?.();
  }

  async function deleteCandidate() {
    if (!data || deleting) return;
    const ok = window.confirm(
      `Permanently delete ${data.candidate.name}? Their PII, notes, threads, and applications will be removed. ` +
        `Funnel and stage analytics stay intact.`,
    );
    if (!ok) return;
    setDeleting(true);
    const res = await fetch(`/api/candidates/${data.candidate.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      flash(json?.error === "forbidden" ? "Only admins can delete candidates." : "Could not delete.");
      return;
    }
    onChanged?.();
    onClose();
  }

  async function deleteApplication() {
    if (!data || deleting) return;
    const ok = window.confirm(
      `Delete this application for ${data.application.jobTitle}? The candidate and their other applications stay.`,
    );
    if (!ok) return;
    setDeleting(true);
    const res = await fetch(`/api/applications/${data.application.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      flash(json?.error === "forbidden" ? "Only admins can delete applications." : "Could not delete.");
      return;
    }
    onChanged?.();
    onClose();
  }

  async function regenerateSummary() {
    if (!data || aiBusy) return;
    setAiBusy(true);
    const res = await fetch("/api/ai/candidate-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId: data.candidate.id, applicationId: data.application.id }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (json?.text) {
      setData({ ...data, application: { ...data.application, aiSummary: json.text } });
      flash("AI summary refreshed.");
      onChanged?.();
    } else {
      flash("Could not generate summary.");
    }
    setAiBusy(false);
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !stripHtml(noteText).trim()) return;
    setNoteBusy(true);
    const body = noteText;
    const res = await fetch(`/api/candidates/${data.candidate.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }).catch(() => null);
    setNoteBusy(false);
    if (!res?.ok) {
      flash("Could not save note.");
      return;
    }
    const json = await res.json().catch(() => ({}));
    setData({
      ...data,
      notes: [
        { id: json?.id || `local-${Date.now()}`, body, author: currentUser.name, createdAt: new Date().toISOString() },
        ...data.notes,
      ],
    });
    setNoteText("");
    flash("Note added.");
    onChanged?.();
  }

  async function ensureThread(): Promise<SheetThread | null> {
    if (!data) return null;
    if (data.thread) return data.thread;
    const res = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidateId: data.candidate.id,
        jobId: data.application.jobId,
        subject: `Re: ${data.application.jobTitle}`,
      }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (!res?.ok || !json?.id) return null;
    const thread: SheetThread = { id: json.id, subject: `Re: ${data.application.jobTitle}`, messages: [] };
    setData({ ...data, thread });
    return thread;
  }

  async function sendReply(body: string): Promise<boolean> {
    const trimmed = body.trim();
    if (!data || !trimmed) return false;
    const thread = await ensureThread();
    if (!thread) {
      flash("Could not start conversation.");
      return false;
    }
    // Try SMTP first; if email isn't configured (412) silently fall back to an
    // internal message so the recruiter still sees their reply land in the UI.
    let res = await fetch(`/api/threads/${thread.id}/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: trimmed }),
    }).catch(() => null);
    if (!res || (!res.ok && res.status === 412)) {
      res = await fetch(`/api/threads/${thread.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed, direction: "out" }),
      }).catch(() => null);
    }
    if (!res?.ok) {
      const json = await res?.json().catch(() => ({}));
      flash(json?.error || "Could not send message.");
      return false;
    }
    const json = await res.json().catch(() => ({}));
    setData((current) =>
      current
        ? {
            ...current,
            thread: {
              ...thread,
              messages: [
                ...thread.messages,
                { id: json?.id || `local-${Date.now()}`, direction: "out", body: trimmed, fromName: currentUser.name, createdAt: new Date().toISOString() },
              ],
            },
          }
        : current,
    );
    flash("Sent.");
    onChanged?.();
    return true;
  }

  // ── Render ─────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <>
        <div className="scrim" onClick={onClose} />
        <div className="sheet sheet-md">
          <div className="sheet-hd">
            <div className="grow">
              <h2 style={{ fontSize: 17 }}>Couldn't load applicant</h2>
            </div>
            <button className="iconbtn" onClick={onClose} aria-label="Close"><Icons.X size={15} /></button>
          </div>
          <div style={{ padding: 24 }}>
            <p className="muted">{loadError}</p>
            <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
              <button className="btn" onClick={load}>Try again</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <div className="scrim" onClick={onClose} />
        <div className="sheet sheet-md">
          <div className="sheet-hd">
            <div className="grow"><div className="ai-shimmer" style={{ width: 220, height: 18, borderRadius: 4 }} /></div>
            <button className="iconbtn" onClick={onClose} aria-label="Close"><Icons.X size={15} /></button>
          </div>
          <div style={{ padding: 24 }}>
            <div className="ai-shimmer" style={{ height: 80, borderRadius: 12, marginBottom: 14 }} />
            <div className="ai-shimmer" style={{ height: 200, borderRadius: 12 }} />
          </div>
        </div>
      </>
    );
  }

  const { application, candidate } = data;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet glass glass-strong profile-sheet" role="dialog" aria-modal="true" aria-label={`${candidate.name} applicant details`}>
        {/* Header */}
        <div className="profile-header">
          <div className="row" style={{ gap: 14, marginBottom: 14 }}>
            <Avatar name={candidate.name} size="lg" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <h2 style={{ fontSize: 19, margin: 0 }}>{candidate.name}</h2>
                {candidate.location && (
                  <span className="chip"><Icons.MapPin size={11} /> {candidate.location}</span>
                )}
                {typeof application.aiFit === "number" && <Chip accent dot>{application.aiFit}% fit</Chip>}
              </div>
              <div className="tiny" style={{ marginTop: 3 }}>
                {application.jobTitle} · Applied {relativeTime(application.appliedAt)}
                {candidate.source ? ` · via ${candidate.source}` : ""}
              </div>
            </div>
            {typeof application.aiFit === "number" ? <RingScore value={application.aiFit} size={44} /> : null}
            <button className="btn btn-sm" onClick={() => setTab("communication")}>
              <Icons.Mail size={12} /> Message
            </button>
            <button className="btn btn-sm" onClick={() => setScheduling(true)}>
              <Icons.Calendar size={12} /> Schedule
            </button>
            {canDelete && (
            <div ref={menuRef} style={{ position: "relative" }}>
              <button
                className="iconbtn"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                disabled={deleting}
              >
                <Icons.MoreH size={15} />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    minWidth: 220,
                    zIndex: 60,
                    background: "var(--glass-bg-strong)",
                    backdropFilter: "blur(22px)",
                    WebkitBackdropFilter: "blur(22px)",
                    border: "0.5px solid var(--glass-border)",
                    borderRadius: 10,
                    padding: 4,
                    boxShadow: "0 10px 40px rgba(0,0,0,0.25)",
                  }}
                >
                  <button
                    role="menuitem"
                    className="btn btn-sm btn-ghost"
                    style={{ width: "100%", justifyContent: "flex-start", color: "oklch(50% 0.18 28)" }}
                    onClick={() => { setMenuOpen(false); deleteApplication(); }}
                  >
                    <Icons.Trash size={12} /> Delete this application
                  </button>
                  <button
                    role="menuitem"
                    className="btn btn-sm btn-ghost"
                    style={{ width: "100%", justifyContent: "flex-start", color: "oklch(50% 0.18 28)" }}
                    onClick={() => { setMenuOpen(false); deleteCandidate(); }}
                  >
                    <Icons.Trash size={12} /> Delete candidate
                  </button>
                </div>
              )}
            </div>
            )}
            <button className="iconbtn" onClick={onClose} aria-label="Close applicant">
              <Icons.X size={15} />
            </button>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className="tiny" style={{ flexShrink: 0 }}>Stage</span>
            <Glass faint style={{ padding: 3, borderRadius: 8, display: "inline-flex", gap: 2, flexWrap: "wrap" }}>
              {stages.map((s) => (
                <button
                  key={s.id}
                  className={`btn btn-sm ${application.stageId === s.id ? "btn-primary" : "btn-ghost"}`}
                  style={{ fontSize: 11.5, height: 24, padding: "0 10px", borderRadius: 6 }}
                  onClick={() => moveStage(s.id)}
                  disabled={stageBusy}
                >
                  {s.name}
                </button>
              ))}
            </Glass>
          </div>
        </div>

        {/* Body */}
        <div className="profile-body">
          {/* Left — main */}
          <div className="profile-main scroll">
            <Glass
              style={{
                padding: 18,
                marginBottom: 18,
                background:
                  "linear-gradient(160deg, color-mix(in oklab, var(--accent-1) 10%, var(--glass-bg)), color-mix(in oklab, var(--accent-2) 8%, var(--glass-bg)))",
              }}
            >
              <div className="row" style={{ marginBottom: 10 }}>
                <AIPill>AI summary</AIPill>
                <span style={{ flex: 1 }} />
                <button className="btn btn-sm btn-ghost" onClick={regenerateSummary} disabled={aiBusy}>
                  <Icons.Sparkle size={12} stroke={2} /> {aiBusy ? "Generating…" : application.aiSummary ? "Regenerate" : "Generate"}
                </button>
              </div>
              {aiBusy ? (
                <div className="ai-shimmer" style={{ height: 70, borderRadius: 10 }} />
              ) : application.aiSummary ? (
                <p style={{ fontSize: 14, color: "var(--ink-0)", lineHeight: 1.6, marginBottom: 12 }}>{application.aiSummary}</p>
              ) : (
                <p className="muted" style={{ marginBottom: 12 }}>
                  No AI summary yet — click Generate to draft one from the application.
                </p>
              )}
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {typeof application.aiFit === "number" && <Chip accent dot>{application.aiFit}% role fit</Chip>}
                {candidate.skills.slice(0, 3).map((skill) => (
                  <Chip key={skill} dot="oklch(68% 0.16 150)">{skill}</Chip>
                ))}
              </div>
            </Glass>

            {/* Pulse — engagement signal. Fetches its own breakdown via
                /api/pulse/[candidateId], so it stays decoupled from the
                profile-sheet payload. See PULSE_FEATURE.md §8.4. */}
            <PulsePanel candidateId={candidate.id} />

            {/* Tabs */}
            <div className="profile-tabs">
              {(
                [
                  { id: "overview", l: "Overview" },
                  { id: "resume", l: "Resume" },
                  { id: "communication", l: "Communication" },
                  { id: "timeline", l: "Timeline" },
                ] as { id: Tab; l: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  className={`profile-tab ${tab === t.id ? "active" : ""}`}
                  onClick={() => setTab(t.id)}
                  type="button"
                >
                  {t.l}
                </button>
              ))}
            </div>

            {tab === "overview" && <OverviewTab data={data} />}
            {tab === "resume" && <ResumeTab data={data} />}
            {tab === "communication" && (
              <CommunicationTab data={data} currentUser={currentUser} onSend={sendReply} />
            )}
            {tab === "timeline" && <TimelineTab data={data} />}
          </div>

          {/* Right — collab panel */}
          <aside className="profile-side scroll">
            <section>
              <h4 style={{ margin: "0 0 10px" }}>Reviewer</h4>
              <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                Owns triaging this candidate. Defaults to the job's lead reviewer; reassign per-application here.
              </p>
              {members ? (
                <select
                  className="select"
                  value={application.reviewerId || ""}
                  onChange={(e) => setReviewer(e.target.value || null)}
                  style={{ width: "100%" }}
                >
                  <option value="">— Unassigned —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="ai-shimmer" style={{ height: 32, borderRadius: 8 }} />
              )}
              {application.reviewerId && members && (
                <div className="row" style={{ marginTop: 8, gap: 8 }}>
                  <Avatar
                    name={members.find((m) => m.id === application.reviewerId)?.name || "?"}
                    size="sm"
                  />
                  <span className="tiny" style={{ flex: 1 }}>
                    {members.find((m) => m.id === application.reviewerId)?.name || "Unknown"}
                  </span>
                </div>
              )}
            </section>

            <section>
              <h4 style={{ margin: "0 0 10px" }}>Interviews</h4>
              {data.interviews.length ? (
                <div className="col" style={{ gap: 8 }}>
                  {data.interviews.map((iv) => {
                    const d = new Date(iv.scheduledAt);
                    // Anyone in the workspace can submit/edit a debrief
                    // (the API enforces workspace membership); we don't
                    // restrict the button by user here. The Mine filter
                    // surfaces "missing debrief" items for interviewers
                    // who haven't filled one in.
                    const past = d.getTime() + iv.durationMin * 60_000 < Date.now();
                    return (
                      <Glass key={iv.id} faint style={{ padding: 10, borderRadius: 10 }}>
                        <div className="row" style={{ gap: 10 }}>
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 8,
                              background: "var(--glass-bg)",
                              border: "0.5px solid var(--line)",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              lineHeight: 1,
                            }}
                          >
                            <span className="tiny" style={{ fontSize: 9, textTransform: "uppercase" }}>
                              {d.toLocaleString(undefined, { weekday: "short" })}
                            </span>
                            <span style={{ fontSize: 15, fontWeight: 600 }}>{d.getDate()}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, textTransform: "capitalize" }}>
                              {iv.kind} interview
                            </div>
                            <div className="tiny mono">
                              {d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" })} · {iv.durationMin} min
                            </div>
                          </div>
                        </div>
                        {iv.interviewers.length > 0 && (
                          <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                            {iv.interviewers.map((p) => (
                              <span
                                key={p.id}
                                className="chip"
                                style={{ height: 20, fontSize: 11, padding: "0 6px", gap: 4 }}
                                title={p.name}
                              >
                                <Avatar name={p.name} size="sm" style={{ width: 14, height: 14, fontSize: 8 }} />
                                {p.name}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="row" style={{ marginTop: 8, gap: 6 }}>
                          {iv.debrief ? (
                            <span
                              className="chip"
                              style={{
                                height: 20,
                                fontSize: 11,
                                padding: "0 6px",
                                background: "var(--accent-soft)",
                                color: "var(--accent-solid)",
                                borderColor: "transparent",
                              }}
                              title={`Debriefed by ${iv.debrief.authorName}`}
                            >
                              <Icons.Check size={10} /> Debriefed
                            </span>
                          ) : past ? (
                            <span className="tiny" style={{ color: "oklch(60% 0.18 28)" }}>
                              Debrief missing
                            </span>
                          ) : null}
                          <span style={{ flex: 1 }} />
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => setDebriefingId(iv.id)}
                            style={{ height: 24, fontSize: 11, padding: "0 8px" }}
                          >
                            <Icons.FileText size={11} /> {iv.debrief ? "Edit debrief" : "Write debrief"}
                          </button>
                        </div>
                      </Glass>
                    );
                  })}
                </div>
              ) : (
                <p className="muted" style={{ fontSize: 12.5 }}>No interviews scheduled yet.</p>
              )}
              <button className="btn btn-sm" style={{ marginTop: 10, width: "100%" }} onClick={() => setScheduling(true)}>
                <Icons.Calendar size={12} /> Schedule interview
              </button>
            </section>

            <section style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <div className="row" style={{ marginBottom: 10 }}>
                <h4 style={{ flex: 1, margin: 0 }}>Team notes</h4>
                <span className="tiny">{data.notes.length}</span>
              </div>
              <div className="col" style={{ gap: 12, flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
                {data.notes.length === 0 && <p className="muted" style={{ fontSize: 12.5 }}>No notes yet.</p>}
                {data.notes.map((note) => (
                  <div key={note.id} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                    <Avatar name={note.author} size="sm" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5 }}>
                        <b style={{ fontWeight: 500 }}>{note.author}</b>
                        <span className="tiny"> · {relativeTime(note.createdAt)}</span>
                      </div>
                      <RichText html={note.body} style={{ fontSize: 13, color: "var(--ink-1)", lineHeight: 1.5, marginTop: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={addNote}>
                <div style={{ marginTop: 14 }}>
                  <Wysiwyg
                    value={noteText}
                    onChange={setNoteText}
                    placeholder="Comment, @mention…"
                    minHeight={70}
                  />
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    <span style={{ flex: 1 }} />
                    <button
                      type="submit"
                      className="btn btn-sm btn-primary"
                      disabled={!stripHtml(noteText).trim() || noteBusy}
                    >
                      <Icons.Send size={11} stroke={2} /> {noteBusy ? "Saving…" : "Add note"}
                    </button>
                  </div>
                </div>
              </form>
            </section>
          </aside>
        </div>
      </div>

      {scheduling && (
        <ScheduleModal
          candidate={{ id: candidate.id, name: candidate.name }}
          applicationId={application.id}
          jobTitle={application.jobTitle}
          onClose={() => setScheduling(false)}
          onDone={() => {
            setScheduling(false);
            load();
            onChanged?.();
          }}
        />
      )}

      {debriefingId && (() => {
        const iv = data.interviews.find((i) => i.id === debriefingId);
        if (!iv) return null;
        return (
          <DebriefModal
            interviewId={iv.id}
            candidateName={candidate.name}
            interviewKind={`${iv.kind} interview`}
            initial={
              iv.debrief
                ? {
                    pros: iv.debrief.pros,
                    cons: iv.debrief.cons,
                    sentiment: iv.debrief.sentiment,
                    rating: iv.debrief.rating,
                    recommend: iv.debrief.recommend,
                  }
                : null
            }
            onClose={() => setDebriefingId(null)}
            onSaved={() => {
              load();
              onChanged?.();
            }}
          />
        );
      })()}

      {toast && (
        <div className="toast" role="status">
          <Icons.Check size={14} style={{ color: "var(--accent-solid)" }} />
          {toast}
        </div>
      )}
    </>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────
function OverviewTab({ data }: { data: SheetData }) {
  const { application, candidate } = data;
  const screening = Object.entries(application.screeningAnswers).filter(
    ([, value]) => value !== null && value !== undefined && String(value).trim() !== "",
  );
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="profile-meta-grid">
        <span className="tiny">Email</span>
        <span>
          {candidate.email ? (
            <a href={`mailto:${candidate.email}`} style={{ color: "var(--accent-solid)" }}>{candidate.email}</a>
          ) : (
            <span className="muted">—</span>
          )}
        </span>
        <span className="tiny">Years exp.</span>
        <span>{candidate.years != null ? `${candidate.years} years` : <span className="muted">—</span>}</span>
        <span className="tiny">Current role</span>
        <span>{candidate.currentRole || <span className="muted">—</span>}</span>
        <span className="tiny">Source</span>
        <span>{candidate.source || <span className="muted">—</span>}</span>
        <span className="tiny">Links</span>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {candidate.linkedin && (
            <a className="chip" href={absHref(candidate.linkedin, "https://linkedin.com/in/")} target="_blank" rel="noreferrer">
              <Icons.Linkedin size={11} /> LinkedIn
            </a>
          )}
          {candidate.github && (
            <a className="chip" href={absHref(candidate.github, "https://github.com/")} target="_blank" rel="noreferrer">
              <Icons.Github size={11} /> GitHub
            </a>
          )}
          {candidate.portfolio && (
            <a className="chip" href={absHref(candidate.portfolio, "https://")} target="_blank" rel="noreferrer">
              <Icons.Globe size={11} /> Portfolio
            </a>
          )}
          {!candidate.linkedin && !candidate.github && !candidate.portfolio && <span className="muted">—</span>}
        </div>
      </div>

      {!!candidate.skills.length && (
        <div>
          <h4 style={{ marginBottom: 8 }}>Skills & tags</h4>
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            {candidate.skills.map((s) => <span key={s} className="chip">{s}</span>)}
          </div>
        </div>
      )}

      {application.whyUs && (
        <div>
          <h4 style={{ marginBottom: 8 }}>Cover letter</h4>
          <Glass faint style={{ padding: 14, borderRadius: 10 }}>
            <RichText html={application.whyUs} style={{ fontSize: 13, color: "var(--ink-1)", lineHeight: 1.6 }} />
          </Glass>
        </div>
      )}

      {application.screeningQuestions.length > 0 && (
        <div>
          <h4 style={{ marginBottom: 8 }}>Screening answers</h4>
          <div className="col" style={{ gap: 8 }}>
            {application.screeningQuestions.map((q) => {
              const answer = application.screeningAnswers[q.id];
              if (answer === null || answer === undefined || String(answer).trim() === "") return null;
              return (
                <Glass key={q.id} faint style={{ padding: 12, borderRadius: 10 }}>
                  <div className="tiny" style={{ fontWeight: 500 }}>{q.label}</div>
                  {typeof answer === "string" && /<[a-z]/i.test(answer) ? (
                    <RichText html={answer} style={{ fontSize: 13, marginTop: 3 }} />
                  ) : (
                    <div style={{ fontSize: 13, marginTop: 3, whiteSpace: "pre-wrap" }}>{String(answer)}</div>
                  )}
                </Glass>
              );
            })}
          </div>
        </div>
      )}

      {data.otherApplications.length > 0 && (
        <div>
          <h4 style={{ marginBottom: 8 }}>Also applied to</h4>
          <div className="col" style={{ gap: 6 }}>
            {data.otherApplications.map((other) => (
              <Glass key={other.id} faint style={{ padding: 10, borderRadius: 10 }}>
                <div className="row">
                  <span style={{ flex: 1, fontSize: 13 }}>{other.jobTitle}</span>
                  <Chip dot={other.stageColor}>{other.stageName}</Chip>
                  <span className="tiny">{relativeTime(other.appliedAt)}</span>
                </div>
              </Glass>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResumeTab({ data }: { data: SheetData }) {
  const { application, candidate } = data;
  if (!application.resumeUrl) {
    return (
      <Glass faint style={{ padding: 18, borderRadius: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          <Icons.FileText size={14} style={{ color: "var(--ink-2)" }} />
          <span className="muted">{candidate.name} didn't attach a resume.</span>
        </div>
      </Glass>
    );
  }
  return (
    <div className="col" style={{ gap: 14 }}>
      <Glass faint style={{ padding: 18, borderRadius: 12 }}>
        <div className="row" style={{ marginBottom: 14 }}>
          <Icons.FileText size={14} style={{ color: "var(--ink-2)" }} />
          <span className="mono tiny" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {application.resumeName || "resume.pdf"}
          </span>
          <a href={application.resumeUrl} target="_blank" rel="noreferrer" className="btn btn-sm btn-ghost">
            <Icons.ArrowUpRight size={12} /> Open
          </a>
          <a href={application.resumeUrl} download className="btn btn-sm btn-ghost">
            <Icons.Upload size={12} style={{ transform: "rotate(180deg)" }} /> Download
          </a>
        </div>
        <CvViewer url={application.resumeUrl} name={application.resumeName} />
      </Glass>

      <ParsedResume text={application.resumeText} />
    </div>
  );
}

function ParsedResume({ text }: { text: string | null }) {
  const [open, setOpen] = React.useState(false);
  const has = !!text && text.trim().length > 0;
  return (
    <Glass faint style={{ padding: 14, borderRadius: 12 }}>
      <div className="row" style={{ gap: 8 }}>
        <Icons.Sparkle size={13} style={{ color: "var(--ink-2)" }} />
        <span className="tiny" style={{ flex: 1 }}>
          {has
            ? `Parsed resume text · ${text!.length.toLocaleString()} chars`
            : "No parsed text — file may be a scanned PDF or unsupported format"}
        </span>
        {has && (
          <button className="btn btn-sm btn-ghost" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {has && open && (
        <pre
          className="mono"
          style={{
            marginTop: 10,
            padding: 12,
            background: "var(--bg-1)",
            border: "0.5px solid var(--line)",
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.5,
            maxHeight: 320,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {text}
        </pre>
      )}
    </Glass>
  );
}

function CommunicationTab({
  data,
  currentUser,
  onSend,
}: {
  data: SheetData;
  currentUser: { id: string; name: string; signature: string };
  onSend: (body: string) => Promise<boolean>;
}) {
  const [reply, setReply] = React.useState(currentUser.signature ? `\n\n${currentUser.signature}` : "");
  const [composing, setComposing] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    if (!reply && currentUser.signature) {
      setReply(`\n\n${currentUser.signature}`);
    }
  }, [currentUser.signature, reply]);

  function generateReply() {
    setComposing(true);
    setReply("");
    const candidate = data.candidate;
    let text = `Hi ${candidate.name.split(" ")[0]},\n\nThanks so much for applying to the ${data.application.jobTitle} role — your background looks like a great match for what we're working on. We'd love to set up a 30-minute conversation this week to learn more about how you approach this kind of work.\n\nDoes Thursday at 14:00 work? Happy to send alternatives.`;
    if (currentUser.signature) {
      text += `\n\n${currentUser.signature}`;
    } else {
      text += `\n\nWarmly,\n${currentUser.name.split(" ")[0]}`;
    }
    let i = 0;
    const tick = () => {
      i += Math.max(1, Math.round(Math.random() * 4));
      setReply(text.slice(0, i));
      if (i < text.length) setTimeout(tick, 18);
      else setComposing(false);
    };
    setTimeout(tick, 200);
  }

  async function send() {
    if (!stripHtml(reply).trim() || sending) return;
    setSending(true);
    const ok = await onSend(reply);
    setSending(false);
    if (ok) setReply("");
  }

  const messages = data.thread?.messages ?? [];

  return (
    <div className="col" style={{ gap: 14 }}>
      {messages.length === 0 ? (
        <Glass faint style={{ padding: 14, borderRadius: 12 }}>
          <p className="muted" style={{ fontSize: 13 }}>No messages yet — write below to start a conversation.</p>
        </Glass>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {messages.map((m) => (
            <Glass key={m.id} faint style={{ padding: 14, borderRadius: 12 }}>
              <div className="row" style={{ marginBottom: 6 }}>
                <Avatar name={m.fromName || (m.direction === "in" ? data.candidate.name : "Team")} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5 }}>
                    <b style={{ fontWeight: 500 }}>{m.fromName || (m.direction === "in" ? data.candidate.name : m.direction === "system" ? "System" : "Team")}</b>
                    <span className="tiny"> · {relativeTime(m.createdAt)}</span>
                  </div>
                </div>
                {m.direction === "out" && <span className="chip" style={{ fontSize: 10.5, height: 18, padding: "0 6px" }}>Sent</span>}
                {m.direction === "system" && <span className="chip" style={{ fontSize: 10.5, height: 18, padding: "0 6px" }}>System</span>}
              </div>
              <MessageBody body={m.body} />
            </Glass>
          ))}
        </div>
      )}

      <Glass faint style={{ padding: 14, borderRadius: 12 }}>
        <div className="row" style={{ marginBottom: 10 }}>
          <Icons.Mail size={13} style={{ color: "var(--ink-2)" }} />
          <span className="tiny">Reply to {data.candidate.name.split(" ")[0]}</span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-sm btn-ghost" onClick={generateReply} disabled={composing}>
            <Icons.Sparkle size={12} stroke={2} /> AI draft
          </button>
        </div>
        <div style={{ position: "relative" }}>
          <Wysiwyg
            value={reply}
            onChange={setReply}
            placeholder="Write a message…"
            minHeight={120}
            maxLines={20}
          />
          {composing && <div className="ai-shimmer" style={{ position: "absolute", inset: 0, pointerEvents: "none", borderRadius: 10 }} />}
        </div>
        <div className="row" style={{ marginTop: 10, gap: 6 }}>
          <span style={{ flex: 1 }} />
          <button className="btn btn-sm btn-primary" onClick={send} disabled={!stripHtml(reply).trim() || sending || composing}>
            <Icons.Send size={11} stroke={2} /> {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </Glass>
    </div>
  );
}

function TimelineTab({ data }: { data: SheetData }) {
  const items: { d: string; t: string; who: string; icon: string }[] = [
    { d: relativeTime(data.application.appliedAt), t: `Application received for ${data.application.jobTitle}`, who: data.candidate.source || "Career site", icon: "Globe" },
    ...data.activity.map((a) => ({
      d: relativeTime(a.createdAt),
      t: a.body,
      who: a.actorName || "System",
      icon: a.icon || "Sparkle",
    })),
    ...data.interviews.map((iv) => ({
      d: relativeTime(iv.scheduledAt),
      t: `${iv.kind[0].toUpperCase() + iv.kind.slice(1)} interview scheduled`,
      who: "Hiring team",
      icon: "Calendar",
    })),
  ];
  return (
    <div>
      {items.length === 0 && <p className="muted">No activity yet.</p>}
      {items.map((it, i) => {
        const Ic = (Icons as any)[it.icon] || Icons.Sparkle;
        return (
          <div key={i} className="timeline-item">
            <div className="timeline-dot"><Ic size={11} /></div>
            <div>
              <div style={{ fontSize: 13 }}>{it.t}</div>
              <div className="tiny" style={{ marginTop: 2 }}>{it.who} · {it.d}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────
function MessageBody({ body }: { body: string }) {
  // Outbound messages now arrive as HTML from the Wysiwyg composer; older
  // messages and inbound replies may still be plain text. Render rich for
  // anything that looks like HTML and pre-wrap for the rest.
  const looksHtml = /<\/?[a-z][\s\S]*?>/i.test(body);
  if (looksHtml) {
    return (
      <RichText
        html={body}
        style={{ fontSize: 13, color: "var(--ink-1)", lineHeight: 1.55 }}
      />
    );
  }
  return (
    <div style={{ fontSize: 13, color: "var(--ink-1)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{body}</div>
  );
}

function absHref(value: string, prefix: string) {
  return value.startsWith("http") ? value : `${prefix}${value}`;
}

function labelize(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}
