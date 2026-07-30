// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import { Glass, Chip, Avatar, AIPill, RingScore, Stars, Icons } from "@/components/primitives";
import { relativeTime } from "@/lib/utils";
import ScheduleModal from "@/components/ScheduleModal";
import DebriefModal from "@/components/DebriefModal";
import { TodoRow, type Todo } from "@/components/TodoButton";
import { useDialogA11y } from "@/components/useDialogA11y";
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
  outcome?: string | null;
  rejectReason?: string | null;
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
type SheetInterview = {
  id: string;
  kind: string;
  scheduledAt: string;
  durationMin: number;
  agenda: string | null;
  meetingUrl: string | null;
  location: string | null;
  interviewers: { id: string; name: string }[];
  debrief: {
    id: string;
    pros: string | null;
    cons: string | null;
    sentiment: string;
    rating: number | null;
    recommend: string | null;
    kitId: string | null;
    kitName: string | null;
    criteria: DebriefCriterion[];
    authorId: string;
    authorName: string;
    updatedAt: string;
  } | null;
  status: string;
};
export type DebriefCriterion = {
  itemId: string;
  label: string;
  kind: string; // rating | text | yesno
  score?: number | null;
  text?: string | null;
  yesno?: boolean | null;
};
type SheetRating = { id: string; authorId: string; authorName: string; score: number; comment: string | null; updatedAt: string };
type SheetData = {
  application: SheetApplication;
  candidate: SheetCandidate;
  otherApplications: { id: string; jobId: string; jobTitle: string; stageName: string; stageColor: string; appliedAt: string; archived: boolean }[];
  interviews: SheetInterview[];
  notes: { id: string; body: string; author: string; createdAt: string }[];
  thread: SheetThread | null;
  activity: { id: string; kind: string; body: string; icon: string; actorName: string | null; createdAt: string }[];
  ratings: SheetRating[];
  todosOpen: number;
};

type RightTab = "activity" | "comments" | "evaluation" | "messages" | "todos";
const PIPELINE_KEYS = ["applied", "screen", "interview", "offer", "hired"];
const RECOMMEND_LABELS: Record<string, string> = {
  strong_yes: "Strong yes",
  yes: "Yes",
  maybe: "Maybe",
  no: "No",
  strong_no: "Strong no",
};
const REJECT_REASONS = [
  "Experience gap",
  "Skills mismatch",
  "Location / relocation",
  "Compensation mismatch",
  "Culture / values fit",
  "Position filled",
  "Candidate withdrew",
  "Other",
];

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
  const [rightTab, setRightTab] = React.useState<RightTab>("activity");
  const [aiBusy, setAiBusy] = React.useState(false);
  const [scheduling, setScheduling] = React.useState(false);
  const [stageBusy, setStageBusy] = React.useState(false);
  const [rejecting, setRejecting] = React.useState(false);
  const [showReject, setShowReject] = React.useState(false);
  const [noteText, setNoteText] = React.useState("");
  const [noteBusy, setNoteBusy] = React.useState(false);
  // Lazily-loaded workspace member directory — fed to the reviewer picker.
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
  const dialogRef = React.useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef);

  // Pipeline stages in canonical order — drives the "Next stage" action.
  const orderedStages = React.useMemo(() => {
    const inPipeline = stages.filter((s) => PIPELINE_KEYS.includes(s.key));
    if (inPipeline.length) {
      return [...inPipeline].sort((a, b) => PIPELINE_KEYS.indexOf(a.key) - PIPELINE_KEYS.indexOf(b.key));
    }
    return stages;
  }, [stages]);

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
      // Don't close the drawer when a child modal (schedule / debrief /
      // reject) is open — its own Escape handler dismisses just that modal.
      if (e.key === "Escape" && !scheduling && !debriefingId && !showReject) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, scheduling, debriefingId, showReject]);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast((c) => (c === message ? null : c)), 2400);
  }

  async function setReviewer(nextId: string | null) {
    if (!data) return;
    const previous = data.application.reviewerId;
    if (previous === nextId) return;
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
    // Snapshot the whole stage tuple so a failed move rolls back cleanly —
    // restoring only stageId left the card's stage name/colour stale.
    const prev = {
      stageId: data.application.stageId,
      stageName: data.application.stageName,
      stageColor: data.application.stageColor,
      stageKey: data.application.stageKey,
    };
    if (prev.stageId === stageId) return;
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
      setData((current) => (current ? { ...current, application: { ...current.application, ...prev } } : current));
      flash("Could not move stage.");
      return;
    }
    flash(`Moved to ${stage?.name || "stage"}.`);
    onChanged?.();
  }

  function advanceStage() {
    if (!data) return;
    const idx = orderedStages.findIndex((s) => s.id === data.application.stageId);
    const next = idx === -1 ? orderedStages[0] : orderedStages[idx + 1];
    if (next) moveStage(next.id);
  }
  const atLastStage = !!data && orderedStages.length > 0 && orderedStages[orderedStages.length - 1]?.id === data.application.stageId;

  async function rejectCandidate(reason: string) {
    if (!data || rejecting) return;
    if (data.application.outcome === "rejected") return;
    setRejecting(true);
    const res = await fetch(`/api/applications/${data.application.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome: "rejected", archived: true, rejectReason: reason || null }),
    }).catch(() => null);
    setRejecting(false);
    if (!res?.ok) {
      flash("Could not reject.");
      return;
    }
    setShowReject(false);
    flash(`${data.candidate.name.split(" ")[0]} rejected.`);
    onChanged?.();
    onClose();
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

  // Upsert (score set) or clear (score null) the current user's rating.
  // The aggregate shown in the header/cards is recomputed from data.ratings,
  // so we just keep that list in sync locally.
  async function saveRating(score: number | null, comment: string | null) {
    if (!data) return;
    const appId = data.application.id;
    if (score == null) {
      const res = await fetch(`/api/applications/${appId}/rating`, { method: "DELETE" }).catch(() => null);
      if (!res?.ok) {
        flash("Could not remove rating.");
        return;
      }
      setData((cur) => (cur ? { ...cur, ratings: cur.ratings.filter((r) => r.authorId !== currentUser.id) } : cur));
      onChanged?.();
      return;
    }
    const res = await fetch(`/api/applications/${appId}/rating`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, comment: comment?.trim() || null }),
    }).catch(() => null);
    if (!res?.ok) {
      flash("Could not save rating.");
      return;
    }
    const json = await res.json().catch(() => ({}));
    setData((cur) => {
      if (!cur) return cur;
      const mine: SheetRating = {
        id: json?.id || `local-${Date.now()}`,
        authorId: currentUser.id,
        authorName: currentUser.name,
        score,
        comment: comment?.trim() || null,
        updatedAt: new Date().toISOString(),
      };
      return { ...cur, ratings: [mine, ...cur.ratings.filter((r) => r.authorId !== currentUser.id)] };
    });
    flash("Rating saved.");
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
  const rejected = application.outcome === "rejected";

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div ref={dialogRef} className="sheet glass glass-strong profile-sheet" role="dialog" aria-modal="true" aria-label={`${candidate.name} applicant details`}>
        {/* Header */}
        <div className="profile-header">
          <div className="row" style={{ gap: 14 }}>
            <Avatar name={candidate.name} size="lg" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <h2 style={{ fontSize: 19, margin: 0 }}>{candidate.name}</h2>
                {candidate.location && (
                  <span className="chip"><Icons.MapPin size={11} /> {candidate.location}</span>
                )}
                {rejected && (
                  <span title={application.rejectReason ? `Reason: ${application.rejectReason}` : undefined}>
                    <Chip dot="oklch(58% 0.2 28)">Rejected{application.rejectReason ? ` · ${application.rejectReason}` : ""}</Chip>
                  </span>
                )}
                {typeof application.aiFit === "number" && <Chip accent dot>{application.aiFit}% fit</Chip>}
              </div>
              <div className="tiny" style={{ marginTop: 3 }}>
                {application.jobTitle} · Applied {relativeTime(application.appliedAt)}
                {candidate.source ? ` · via ${candidate.source}` : ""}
              </div>
            </div>
            {typeof application.aiFit === "number" ? <RingScore value={application.aiFit} size={44} /> : null}
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
        </div>

        {/* Body */}
        <div className="profile-body">
          {/* Left — candidate + application detail */}
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

            {/* Pulse — engagement signal. Fetches its own breakdown. */}
            <PulsePanel candidateId={candidate.id} />

            {/* Application card — stage control lives here (Teamtailor-style). */}
            <section className="profile-appcard">
              <div className="row" style={{ gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{application.jobTitle}</div>
                  {(application.department || application.location) && (
                    <div className="tiny">{[application.department, application.location].filter(Boolean).join(" · ")}</div>
                  )}
                </div>
                <Chip dot={application.stageColor}>{application.stageName}</Chip>
              </div>
              <div className="profile-stage-picker">
                {orderedStages.map((s) => (
                  <button
                    key={s.id}
                    className={`btn btn-sm ${application.stageId === s.id ? "btn-primary" : "btn-ghost"}`}
                    style={{ fontSize: 11.5, height: 26, padding: "0 10px", borderRadius: 6 }}
                    onClick={() => moveStage(s.id)}
                    disabled={stageBusy || rejected}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </section>

            {/* Team rating */}
            <RatingBlock ratings={data.ratings} currentUser={currentUser} onSave={saveRating} />

            {/* Reviewer */}
            <section style={{ marginTop: 18 }}>
              <h4 style={{ margin: "0 0 8px" }}>Reviewer</h4>
              {members ? (
                <select
                  className="select"
                  value={application.reviewerId || ""}
                  onChange={(e) => setReviewer(e.target.value || null)}
                  style={{ width: "100%" }}
                >
                  <option value="">— Unassigned —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              ) : (
                <div className="ai-shimmer" style={{ height: 32, borderRadius: 8 }} />
              )}
            </section>

            <hr className="profile-rule" />

            <DetailsBlock data={data} />

            {application.whyUs && (
              <div style={{ marginTop: 18 }}>
                <h4 style={{ marginBottom: 8 }}>Cover letter</h4>
                <Glass faint style={{ padding: 14, borderRadius: 10 }}>
                  <RichText html={application.whyUs} style={{ fontSize: 13, color: "var(--ink-1)", lineHeight: 1.6 }} />
                </Glass>
              </div>
            )}

            {application.screeningQuestions.length > 0 && (
              <div style={{ marginTop: 18 }}>
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

            <div style={{ marginTop: 18 }}>
              <h4 style={{ marginBottom: 8 }}>Resume</h4>
              <ResumeBlock data={data} />
            </div>

            {data.otherApplications.length > 0 && (
              <div style={{ marginTop: 18 }}>
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

          {/* Right — tabbed collaboration panel */}
          <aside className="profile-side scroll">
            <div className="profile-tabs">
              {(
                [
                  { id: "activity", l: "Activity" },
                  { id: "comments", l: "Comments", n: data.notes.length },
                  { id: "evaluation", l: "Evaluation", n: data.interviews.length },
                  { id: "todos", l: "To-dos", n: data.todosOpen },
                  { id: "messages", l: "Messages", n: data.thread?.messages.length || 0 },
                ] as { id: RightTab; l: string; n?: number }[]
              ).map((t) => (
                <button
                  key={t.id}
                  className={`profile-tab ${rightTab === t.id ? "active" : ""}`}
                  onClick={() => setRightTab(t.id)}
                  type="button"
                >
                  {t.l}
                  {t.n ? <span className="profile-tab-count">{t.n}</span> : null}
                </button>
              ))}
            </div>

            {rightTab === "activity" && <ActivityTab data={data} />}
            {rightTab === "comments" && (
              <CommentsTab
                notes={data.notes}
                noteText={noteText}
                setNoteText={setNoteText}
                onSubmit={addNote}
                busy={noteBusy}
              />
            )}
            {rightTab === "evaluation" && (
              <EvaluationTab
                interviews={data.interviews}
                onWriteDebrief={setDebriefingId}
                onSchedule={() => setScheduling(true)}
              />
            )}
            {rightTab === "todos" && (
              <TodosTab candidateId={candidate.id} applicationId={application.id} currentUser={currentUser} onChanged={onChanged} />
            )}
            {rightTab === "messages" && (
              <MessagesTab data={data} currentUser={currentUser} onSend={sendReply} />
            )}
          </aside>
        </div>

        {/* Sticky action bar */}
        <div className="profile-actionbar">
          <button
            className="btn btn-sm btn-danger"
            onClick={() => setShowReject(true)}
            disabled={rejecting || rejected}
            title="Reject and remove from the active board"
          >
            <Icons.X size={13} /> {rejected ? "Rejected" : "Reject"}
          </button>
          <button className="btn btn-sm" onClick={advanceStage} disabled={stageBusy || atLastStage || rejected}>
            <Icons.ArrowRight size={13} /> Next stage
          </button>
          <button className="btn btn-sm" onClick={() => setScheduling(true)}>
            <Icons.Calendar size={13} /> Book meeting
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn btn-sm btn-ghost" onClick={() => setRightTab("comments")}>
            <Icons.Comment size={13} /> Comment
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => setRightTab("messages")}>
            <Icons.Mail size={13} /> Message
          </button>
        </div>
      </div>

      {showReject && (
        <RejectModal
          candidateName={candidate.name}
          busy={rejecting}
          onCancel={() => setShowReject(false)}
          onConfirm={rejectCandidate}
        />
      )}

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
            stageKey={data.application.stageKey}
            initial={
              iv.debrief
                ? {
                    pros: iv.debrief.pros,
                    cons: iv.debrief.cons,
                    sentiment: iv.debrief.sentiment,
                    rating: iv.debrief.rating,
                    recommend: iv.debrief.recommend,
                    kitId: iv.debrief.kitId,
                    criteria: iv.debrief.criteria,
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

// ─── Left-pane blocks ─────────────────────────────────────────────────
function RatingBlock({
  ratings,
  currentUser,
  onSave,
}: {
  ratings: SheetRating[];
  currentUser: { id: string; name: string };
  onSave: (score: number | null, comment: string | null) => void | Promise<void>;
}) {
  const myRating = ratings.find((r) => r.authorId === currentUser.id) || null;
  const others = ratings.filter((r) => r.authorId !== currentUser.id);
  const count = ratings.length;
  const avg = count ? Math.round((ratings.reduce((sum, r) => sum + r.score, 0) / count) * 10) / 10 : null;

  const [comment, setComment] = React.useState(myRating?.comment || "");
  const [commentBusy, setCommentBusy] = React.useState(false);
  // Re-sync the draft if my rating changes (e.g. after a reload).
  React.useEffect(() => {
    setComment(myRating?.comment || "");
  }, [myRating?.id, myRating?.comment]);
  const commentDirty = (myRating?.comment || "") !== comment.trim();

  async function saveComment() {
    if (!myRating) return;
    setCommentBusy(true);
    await onSave(myRating.score, comment);
    setCommentBusy(false);
  }

  return (
    <section className="profile-rating">
      <div className="row" style={{ marginBottom: 10 }}>
        <h4 style={{ margin: 0, flex: 1 }}>Team rating</h4>
        {avg != null && (
          <span className="row" style={{ gap: 6 }}>
            <Stars value={avg} size={14} />
            <span className="tiny" style={{ color: "var(--ink-1)", fontVariantNumeric: "tabular-nums" }}>
              {avg.toFixed(1)} · {count} review{count === 1 ? "" : "s"}
            </span>
          </span>
        )}
      </div>

      <Glass faint style={{ padding: 12, borderRadius: 10 }}>
        <div className="row" style={{ gap: 10 }}>
          <Avatar name={currentUser.name} size="sm" />
          <span className="tiny" style={{ flex: 1 }}>Your rating</span>
          <Stars value={myRating?.score ?? null} size={18} onChange={(n) => onSave(n, comment)} ariaLabel="Your rating" />
        </div>
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          <input
            className="input"
            style={{ flex: 1, height: 30, fontSize: 12.5 }}
            placeholder={myRating ? "Add a note to your rating…" : "Rate first to add a note"}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={!myRating}
            onKeyDown={(e) => {
              if (e.key === "Enter" && commentDirty) saveComment();
            }}
          />
          {myRating && commentDirty && (
            <button className="btn btn-sm btn-primary" onClick={saveComment} disabled={commentBusy}>
              {commentBusy ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </Glass>

      {others.length > 0 && (
        <div className="col" style={{ gap: 8, marginTop: 10 }}>
          {others.map((r) => (
            <div key={r.id} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
              <Avatar name={r.authorName} size="sm" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <b style={{ fontWeight: 500, fontSize: 12.5 }}>{r.authorName}</b>
                  <Stars value={r.score} size={12} />
                  <span className="tiny muted">{relativeTime(r.updatedAt)}</span>
                </div>
                {r.comment && (
                  <div className="tiny" style={{ color: "var(--ink-1)", marginTop: 2, whiteSpace: "pre-wrap" }}>{r.comment}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DetailsBlock({ data }: { data: SheetData }) {
  const { candidate } = data;
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
          <h4 style={{ marginBottom: 8 }}>Skills &amp; tags</h4>
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            {candidate.skills.map((s) => <span key={s} className="chip">{s}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

function ResumeBlock({ data }: { data: SheetData }) {
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

// ─── Right-pane tabs ──────────────────────────────────────────────────
function ActivityTab({ data }: { data: SheetData }) {
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
      t: `${iv.kind ? iv.kind[0].toUpperCase() + iv.kind.slice(1) : "Interview"} interview scheduled`,
      who: "Hiring team",
      icon: "Calendar",
    })),
  ];
  return (
    <div>
      {items.length === 0 && <p className="muted">No activity yet.</p>}
      {items.map((it, i) => {
        const Ic = (Icons as Record<string, React.FC<{ size?: number }>>)[it.icon] || Icons.Sparkle;
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

function CommentsTab({
  notes,
  noteText,
  setNoteText,
  onSubmit,
  busy,
}: {
  notes: SheetData["notes"];
  noteText: string;
  setNoteText: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  busy: boolean;
}) {
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="col" style={{ gap: 12 }}>
        {notes.length === 0 && <p className="muted" style={{ fontSize: 12.5 }}>No comments yet — start the internal discussion below.</p>}
        {notes.map((note) => (
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
      <form onSubmit={onSubmit}>
        <Wysiwyg value={noteText} onChange={setNoteText} placeholder="Comment, @mention…" minHeight={70} />
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          <span style={{ flex: 1 }} />
          <button type="submit" className="btn btn-sm btn-primary" disabled={!stripHtml(noteText).trim() || busy}>
            <Icons.Send size={11} stroke={2} /> {busy ? "Saving…" : "Add comment"}
          </button>
        </div>
      </form>
    </div>
  );
}

function EvaluationTab({
  interviews,
  onWriteDebrief,
  onSchedule,
}: {
  interviews: SheetInterview[];
  onWriteDebrief: (id: string) => void;
  onSchedule: () => void;
}) {
  return (
    <div className="col" style={{ gap: 8 }}>
      {interviews.length === 0 ? (
        <p className="muted" style={{ fontSize: 12.5 }}>No interviews scheduled yet. Book one to collect structured feedback.</p>
      ) : (
        interviews.map((iv) => {
          const d = new Date(iv.scheduledAt);
          const past = d.getTime() + iv.durationMin * 60_000 < Date.now();
          return (
            <Glass key={iv.id} faint style={{ padding: 10, borderRadius: 10 }}>
              <div className="row" style={{ gap: 10 }}>
                <div
                  style={{
                    width: 40, height: 40, borderRadius: 8,
                    background: "var(--glass-bg)", border: "0.5px solid var(--line)",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1,
                  }}
                >
                  <span className="tiny" style={{ fontSize: 9, textTransform: "uppercase" }}>
                    {d.toLocaleString(undefined, { weekday: "short" })}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{d.getDate()}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, textTransform: "capitalize" }}>{iv.kind} interview</div>
                  <div className="tiny mono">
                    {d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" })} · {iv.durationMin} min
                  </div>
                </div>
              </div>
              {iv.interviewers.length > 0 && (
                <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {iv.interviewers.map((p) => (
                    <span key={p.id} className="chip" style={{ height: 20, fontSize: 11, padding: "0 6px", gap: 4 }} title={p.name}>
                      <Avatar name={p.name} size="sm" style={{ width: 14, height: 14, fontSize: 8 }} />
                      {p.name}
                    </span>
                  ))}
                </div>
              )}
              {iv.debrief && (iv.debrief.rating != null || iv.debrief.recommend || iv.debrief.pros || iv.debrief.cons || iv.debrief.criteria.length > 0) && (
                <div className="col" style={{ gap: 5, marginTop: 8 }}>
                  {(iv.debrief.rating != null || iv.debrief.recommend || iv.debrief.kitName) && (
                    <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {iv.debrief.rating != null && <Stars value={iv.debrief.rating} size={12} />}
                      {iv.debrief.recommend && (
                        <span className="chip" style={{ height: 18, fontSize: 10.5, padding: "0 6px" }}>
                          {RECOMMEND_LABELS[iv.debrief.recommend] || iv.debrief.recommend}
                        </span>
                      )}
                      {iv.debrief.kitName && <span className="tiny muted">{iv.debrief.kitName}</span>}
                    </div>
                  )}
                  {iv.debrief.criteria.length > 0 && (
                    <div className="col" style={{ gap: 3, marginTop: 1 }}>
                      {iv.debrief.criteria.map((c) => {
                        if (c.kind === "text") {
                          if (!c.text) return null;
                          return (
                            <div key={c.itemId} style={{ fontSize: 11.5, lineHeight: 1.4 }}>
                              <span className="tiny" style={{ color: "var(--ink-2)" }}>{c.label}: </span>
                              <span style={{ color: "var(--ink-1)" }}>{c.text}</span>
                            </div>
                          );
                        }
                        return (
                          <div key={c.itemId} className="row" style={{ gap: 6 }}>
                            <span className="tiny" style={{ flex: 1, minWidth: 0, color: "var(--ink-2)" }}>{c.label}</span>
                            {c.kind === "rating" &&
                              (c.score != null ? <Stars value={c.score} size={11} /> : <span className="tiny muted">—</span>)}
                            {c.kind === "yesno" && (
                              <span className="tiny" style={{ color: "var(--ink-1)" }}>{c.yesno == null ? "—" : c.yesno ? "Yes" : "No"}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {iv.debrief.pros && <div className="tiny" style={{ color: "var(--ink-1)" }}><b>+ </b>{iv.debrief.pros}</div>}
                  {iv.debrief.cons && <div className="tiny" style={{ color: "var(--ink-1)" }}><b>− </b>{iv.debrief.cons}</div>}
                </div>
              )}
              <div className="row" style={{ marginTop: 8, gap: 6 }}>
                {iv.debrief ? (
                  <span
                    className="chip"
                    style={{ height: 20, fontSize: 11, padding: "0 6px", background: "var(--accent-soft)", color: "var(--accent-solid)", borderColor: "transparent" }}
                    title={`Debriefed by ${iv.debrief.authorName}`}
                  >
                    <Icons.Check size={10} /> Debriefed
                  </span>
                ) : past ? (
                  <span className="tiny" style={{ color: "oklch(60% 0.18 28)" }}>Debrief missing</span>
                ) : null}
                <span style={{ flex: 1 }} />
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => onWriteDebrief(iv.id)} style={{ height: 24, fontSize: 11, padding: "0 8px" }}>
                  <Icons.FileText size={11} /> {iv.debrief ? "Edit debrief" : "Write debrief"}
                </button>
              </div>
            </Glass>
          );
        })
      )}
      <button className="btn btn-sm" style={{ marginTop: 6, width: "100%" }} onClick={onSchedule}>
        <Icons.Calendar size={12} /> Schedule interview
      </button>
    </div>
  );
}

function TodosTab({
  candidateId,
  applicationId,
  currentUser,
  onChanged,
}: {
  candidateId: string;
  applicationId: string;
  currentUser: { id: string; name: string };
  onChanged?: () => void;
}) {
  const [todos, setTodos] = React.useState<Todo[] | null>(null);
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await fetch(`/api/todos?candidateId=${candidateId}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const json = await res.json().catch(() => null);
    if (json?.todos) setTodos(json.todos);
  }, [candidateId]);
  React.useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), candidateId, applicationId }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      const json = await res.json().catch(() => null);
      if (json?.todo) setTodos((cur) => [json.todo, ...(cur || [])]);
      setTitle("");
      onChanged?.();
    }
  }

  async function toggle(t: Todo) {
    setTodos((cur) => (cur ? cur.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) : cur));
    const res = await fetch(`/api/todos/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !t.done }),
    }).catch(() => null);
    if (!res?.ok) {
      setTodos((cur) => (cur ? cur.map((x) => (x.id === t.id ? { ...x, done: t.done } : x)) : cur));
      return;
    }
    onChanged?.();
  }
  async function remove(t: Todo) {
    setTodos((cur) => (cur ? cur.filter((x) => x.id !== t.id) : cur));
    const res = await fetch(`/api/todos/${t.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setTodos((cur) => (cur && !cur.some((x) => x.id === t.id) ? [t, ...cur] : cur));
      return;
    }
    onChanged?.();
  }

  return (
    <div className="col" style={{ gap: 8 }}>
      <form onSubmit={add}>
        <div className="row" style={{ gap: 6 }}>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a to-do for this candidate…"
            style={{ flex: 1, height: 32, fontSize: 12.5 }}
          />
          <button type="submit" className="btn btn-sm btn-primary" disabled={!title.trim() || busy} style={{ height: 32 }}>
            <Icons.Plus size={12} /> Add
          </button>
        </div>
      </form>
      {todos === null ? (
        <div className="ai-shimmer" style={{ height: 44, borderRadius: 8 }} />
      ) : todos.length === 0 ? (
        <p className="muted" style={{ fontSize: 12.5 }}>No to-dos yet — add one above to track follow-through on this candidate.</p>
      ) : (
        <div className="col" style={{ gap: 2 }}>
          {todos.map((t) => (
            <TodoRow key={t.id} t={t} me={currentUser.id} onToggle={() => toggle(t)} onRemove={() => remove(t)} hideCandidate />
          ))}
        </div>
      )}
    </div>
  );
}

function MessagesTab({
  data,
  currentUser,
  onSend,
}: {
  data: SheetData;
  currentUser: { id: string; name: string; signature: string };
  onSend: (body: string) => Promise<boolean>;
}) {
  // Seed the composer with the signature once (currentUser is a stable prop
  // from the server layout). Deliberately NOT re-seeded on change: a reactive
  // effect here refilled the box every time the user cleared it.
  const [reply, setReply] = React.useState(currentUser.signature ? `\n\n${currentUser.signature}` : "");
  const [composing, setComposing] = React.useState(false);
  const [sending, setSending] = React.useState(false);

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
          <Wysiwyg value={reply} onChange={setReply} placeholder="Write a message…" minHeight={120} maxLines={20} />
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

// ─── Reject modal ─────────────────────────────────────────────────────
function RejectModal({
  candidateName,
  busy,
  onCancel,
  onConfirm,
}: {
  candidateName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = React.useState(REJECT_REASONS[0]);
  const [note, setNote] = React.useState("");
  const dialogRef = React.useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef);
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const trimmed = note.trim();
  const full = trimmed ? (reason === "Other" ? trimmed : `${reason} — ${trimmed}`) : reason;

  return (
    <>
      <div className="scrim" onClick={onCancel} />
      <div ref={dialogRef} className="sheet glass glass-strong sheet-md" role="dialog" aria-modal="true" aria-label={`Reject ${candidateName}`}>
        <div className="sheet-hd">
          <div className="grow">
            <div className="topbar-crumb">Reject applicant</div>
            <h2 style={{ fontSize: 18 }}>{candidateName}</h2>
          </div>
          <button className="iconbtn" onClick={onCancel} aria-label="Close">
            <Icons.X size={15} />
          </button>
        </div>
        <div className="sheet-body" style={{ padding: 22 }}>
          <label className="label">Reason</label>
          <select className="select" value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: "100%" }}>
            {REJECT_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <label className="label" style={{ marginTop: 14 }}>Note <span className="muted">(optional)</span></label>
          <textarea
            className="input"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Context for the team…"
            style={{ fontFamily: "inherit" }}
          />
          <p className="tiny muted" style={{ marginTop: 10 }}>
            They&apos;ll be removed from the active board. You can still send a rejection note from Messages.
          </p>
        </div>
        <div className="sheet-ft">
          <span style={{ flex: 1 }} />
          <button className="btn btn-sm" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn btn-sm btn-danger" onClick={() => onConfirm(full)} disabled={busy}>
            <Icons.X size={12} /> {busy ? "Rejecting…" : "Reject"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────
function MessageBody({ body }: { body: string }) {
  const looksHtml = /<\/?[a-z][\s\S]*?>/i.test(body);
  if (looksHtml) {
    return <RichText html={body} style={{ fontSize: 13, color: "var(--ink-1)", lineHeight: 1.55 }} />;
  }
  return <div style={{ fontSize: 13, color: "var(--ink-1)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{body}</div>;
}

function absHref(value: string, prefix: string) {
  return value.startsWith("http") ? value : `${prefix}${value}`;
}
