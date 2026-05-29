// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Glass, Chip, Avatar, Icons } from "@/components/primitives";
import { relativeTime, fmtMoney } from "@/lib/utils";
import Wysiwyg from "@/components/Wysiwyg";
import RichText from "@/components/RichText";
import { markdownToHtml } from "@/lib/markdown";

type JobShape = {
  id: string;
  slug: string;
  title: string;
  department: string | null;
  location: string | null;
  employment: string | null;
  status: string;
  pitch: string | null;
  description: string | null;
  requirements: string[];
  niceToHave: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryDisplay: string | null;
  processSteps: { n: string; who: string; d: string }[];
  leadReviewerId: string | null;
  hiringTeam: { userId: string; name: string; email: string; role: string }[];
  channels: Record<string, boolean>;
  publishedAt: string | null;
  createdAt: string;
  applicantCount: number;
  newThisWeek: number;
  avgAge: number;
  screening: { id: string; label: string; kind: string; required: boolean }[];
};

type StageStat = { key: string; name: string; color: string; count: number };

const TABS = [
  { id: "description", l: "Description" },
  { id: "screening", l: "Screening" },
  { id: "process", l: "Hiring process" },
  { id: "team", l: "Hiring team" },
  { id: "publish", l: "Publishing" },
  { id: "analytics", l: "Analytics" },
] as const;
type Tab = (typeof TABS)[number]["id"];

type Member = { id: string; name: string; email: string; role: string };

export default function JobDetail({
  job,
  workspaceSlug,
  publicDomain,
  stages,
  members,
  currentRole,
}: {
  job: JobShape;
  workspaceSlug: string;
  publicDomain: string;
  stages: StageStat[];
  members: Member[];
  currentRole: string;
}) {
  const canPublish = currentRole === "owner" || currentRole === "admin";
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("description");
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [draft, setDraft] = React.useState({
    pitch: job.pitch || "",
    description: job.description || "",
    requirements: job.requirements.join("\n"),
    niceToHave: job.niceToHave.join("\n"),
    salaryDisplay: job.salaryDisplay || fmtMoney(job.salaryMin, job.salaryMax, job.salaryCurrency || undefined) || "",
  });

  // Re-sync the local draft when the job changes from the server (after a save,
  // a teammate's edit, or a navigation between roles). Skip while the user is
  // mid-edit so we don't trample unsaved changes.
  React.useEffect(() => {
    if (editing) return;
    setDraft({
      pitch: job.pitch || "",
      description: job.description || "",
      requirements: job.requirements.join("\n"),
      niceToHave: job.niceToHave.join("\n"),
      salaryDisplay: job.salaryDisplay || fmtMoney(job.salaryMin, job.salaryMax, job.salaryCurrency || undefined) || "",
    });
  }, [job, editing]);

  const days = Math.max(
    0,
    Math.round((Date.now() - new Date(job.publishedAt || job.createdAt).getTime()) / 86_400_000),
  );
  const statusColor =
    job.status === "Open" ? "oklch(68% 0.16 150)" : job.status === "Draft" ? "oklch(70% 0.15 60)" : "var(--ink-3)";
  const lateStage = stages
    .filter((s) => ["interview", "offer"].includes(s.key))
    .reduce((a, s) => a + s.count, 0);

  async function setStatus(status: "Open" | "Draft" | "Closed") {
    if (status === "Closed") {
      const ok = window.confirm(
        `Close "${job.title}"? The role disappears from the career site immediately. ` +
          `Existing applicants stay in the pipeline and you can reopen the role anytime.`,
      );
      if (!ok) return;
    }
    setBusy(true);
    await fetch(`/api/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    setBusy(false);
    router.refresh();
  }

  async function saveDescription() {
    setBusy(true);
    await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        pitch: draft.pitch.trim() || null,
        description: draft.description,
        requirements: draft.requirements.split("\n").map((s) => s.trim()).filter(Boolean),
        niceToHave: draft.niceToHave.split("\n").map((s) => s.trim()).filter(Boolean),
        salaryDisplay: draft.salaryDisplay.trim() || null,
      }),
    });
    setBusy(false);
    setEditing(false);
    router.refresh();
  }

  async function toggleChannel(key: string, value: boolean) {
    await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      body: JSON.stringify({ channels: { ...job.channels, [key]: value } }),
    });
    router.refresh();
  }

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  async function deleteJob() {
    const ok = window.confirm(
      `Permanently delete "${job.title}"? This removes the job, all its applications, threads, and screening questions. ` +
        `Funnel and stage analytics for the role stay intact.`,
    );
    if (!ok) return;
    setDeleting(true);
    const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      window.alert(json?.error === "forbidden" ? "Only admins can delete jobs." : "Could not delete the job.");
      return;
    }
    router.push("/jobs");
  }

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      {/* Breadcrumb + actions */}
      <div className="row" style={{ marginBottom: 14 }}>
        <Link href="/jobs" className="btn btn-sm btn-ghost">
          <Icons.ChevronLeft size={12} /> All jobs
        </Link>
        <span style={{ flex: 1 }} />
        <a
          className="btn btn-sm"
          href={`http://${workspaceSlug}.${publicDomain}/jobs/${job.slug}`}
          target="_blank"
          rel="noreferrer"
        >
          <Icons.ArrowUpRight size={12} /> Open public link
        </a>
        <Link className="btn btn-sm" href={`/pipeline?job=${job.id}`}>
          <Icons.Pipeline size={12} /> Open pipeline
        </Link>
        {canPublish && (
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            className="btn btn-sm"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            disabled={deleting}
          >
            <Icons.MoreH size={12} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                minWidth: 200,
                zIndex: 40,
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
                onClick={() => { setMenuOpen(false); deleteJob(); }}
              >
                <Icons.Trash size={12} /> Delete job
              </button>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Hero */}
      <Glass style={{ padding: 26, borderRadius: 18, marginBottom: 14 }}>
        <div className="row" style={{ gap: 14, alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <span
                className="chip"
                style={{
                  background: `color-mix(in oklab, ${statusColor} 16%, transparent)`,
                  color: statusColor,
                  borderColor: "transparent",
                  fontWeight: 600,
                }}
              >
                <span className="chip-dot" style={{ background: statusColor }} />
                {job.status}
              </span>
              {job.department && <span className="chip">{job.department}</span>}
              {job.location && (
                <span className="chip">
                  <Icons.MapPin size={11} stroke={1.8} /> {job.location}
                </span>
              )}
              <span className="chip">
                <Icons.Clock size={11} /> Posted {days}d ago
              </span>
              {job.employment && <span className="chip">{job.employment}</span>}
            </div>
            <h1 style={{ fontSize: 30, letterSpacing: "-0.025em" }}>{job.title}</h1>
            {job.pitch && (
              <p style={{ marginTop: 8, fontSize: 15, color: "var(--ink-1)", maxWidth: 720 }}>{job.pitch}</p>
            )}
          </div>
          <div className="col" style={{ gap: 8, flexShrink: 0, alignItems: "stretch" }}>
            {canPublish ? (
              <>
                {job.status === "Draft" && (
                  <button className="btn btn-primary" disabled={busy} onClick={() => setStatus("Open")}>
                    <Icons.ArrowUpRight size={13} stroke={2} /> Publish
                  </button>
                )}
                {job.status === "Open" && (
                  <>
                    <button className="btn" disabled={busy} onClick={() => setStatus("Draft")}>
                      <Icons.X size={12} /> Unpublish
                    </button>
                    <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setStatus("Closed")}>
                      Close role
                    </button>
                  </>
                )}
                {job.status === "Closed" && (
                  <>
                    <button className="btn btn-primary" disabled={busy} onClick={() => setStatus("Open")}>
                      <Icons.ArrowUpRight size={13} stroke={2} /> Reopen role
                    </button>
                    <span className="tiny muted" style={{ textAlign: "center" }}>
                      Republishes immediately on the career site
                    </span>
                  </>
                )}
              </>
            ) : (
              <span className="tiny muted" style={{ textAlign: "center", maxWidth: 180 }}>
                Only admins can publish, close, or reopen roles.
              </span>
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            paddingTop: 14,
            borderTop: "0.5px solid var(--line)",
          }}
        >
          <Stat2 v={job.applicantCount} l="Applicants" />
          <Stat2 v={job.newThisWeek} l="New this week" accent={job.newThisWeek > 0} />
          <Stat2 v={lateStage} l="In late stages" />
          <Stat2
            v={
              (job.salaryDisplay && job.salaryDisplay.split(" ")[0]) ||
              fmtMoney(job.salaryMin, job.salaryMax, job.salaryCurrency || undefined) ||
              "—"
            }
            l="Salary band"
            small
          />
        </div>
      </Glass>

      {/* Tabs */}
      <Glass faint style={{ display: "inline-flex", padding: 3, borderRadius: 10, marginBottom: 14, gap: 2 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="btn btn-sm btn-ghost"
            style={{
              height: 30,
              padding: "0 14px",
              fontSize: 12.5,
              borderRadius: 7,
              background: tab === t.id ? "var(--glass-bg-strong)" : "transparent",
              border: tab === t.id ? "0.5px solid var(--glass-border)" : "0.5px solid transparent",
              color: tab === t.id ? "var(--ink-0)" : "var(--ink-2)",
            }}
          >
            {t.l}
          </button>
        ))}
      </Glass>

      {tab === "description" && (
        <DescriptionTab
          job={job}
          editing={editing}
          setEditing={setEditing}
          draft={draft}
          setDraft={setDraft}
          busy={busy}
          onSave={saveDescription}
        />
      )}
      {tab === "screening" && <ScreeningTab job={job} />}
      {tab === "process" && <ProcessTab job={job} />}
      {tab === "team" && (
        <TeamCard
          job={job}
          members={members}
          canManage={currentRole === "owner" || currentRole === "admin"}
        />
      )}
      {tab === "publish" && <PublishingTab job={job} workspaceSlug={workspaceSlug} publicDomain={publicDomain} onToggle={toggleChannel} />}
      {tab === "analytics" && <JobAnalytics job={job} stages={stages} />}
    </div>
  );
}

function Stat2({
  v,
  l,
  accent,
  small,
}: {
  v: number | string;
  l: string;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: small ? 16 : 22,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: accent ? "var(--accent-solid)" : "var(--ink-0)",
        }}
      >
        {v}
      </div>
      <div className="tiny" style={{ marginTop: 2 }}>
        {l}
      </div>
    </div>
  );
}

function DescriptionTab({
  job,
  editing,
  setEditing,
  draft,
  setDraft,
  busy,
  onSave,
}: {
  job: JobShape;
  editing: boolean;
  setEditing: (v: boolean) => void;
  draft: {
    pitch: string;
    description: string;
    requirements: string;
    niceToHave: string;
    salaryDisplay: string;
  };
  setDraft: React.Dispatch<React.SetStateAction<typeof draft>>;
  busy: boolean;
  onSave: () => Promise<void>;
}) {
  const [aiBusy, setAiBusy] = React.useState(false);

  async function aiRewrite() {
    setAiBusy(true);
    const r = await fetch("/api/ai/rewrite-jd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Send `title` as well as `jobId` — the server falls back to looking up
      // the job by id when title is absent, but passing both avoids the extra
      // DB read.
      body: JSON.stringify({ jobId: job.id, title: job.title, rough: draft.description }),
    }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (j?.text) {
      // Anthropic and friends prefer markdown for prose output. Convert it
      // into the same HTML shape the Wysiwyg editor emits so paragraphs,
      // bold, italics, and lists render properly instead of leaking
      // `**asterisks**` and stray `#` into the description.
      setDraft((d) => ({ ...d, description: markdownToHtml(j.text) }));
    }
    setAiBusy(false);
  }

  return (
    <Glass style={{ padding: 26, borderRadius: 16 }}>
      <div className="row" style={{ marginBottom: 18 }}>
        <h3 style={{ flex: 1 }}>Position description</h3>
        {editing ? (
          <>
            <button className="btn btn-sm btn-ghost" onClick={aiRewrite} disabled={aiBusy}>
              <Icons.Sparkle size={12} stroke={2} /> {aiBusy ? "Rewriting…" : "AI rewrite"}
            </button>
            <button className="btn btn-sm" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-sm btn-primary" onClick={onSave} disabled={busy}>
              <Icons.Check size={12} stroke={2} /> {busy ? "Saving…" : "Save changes"}
            </button>
          </>
        ) : (
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            <Icons.FileText size={12} /> Edit description
          </button>
        )}
      </div>

      {editing ? (
        <div className="col" style={{ gap: 14, position: "relative" }}>
          <DField label="One-line pitch">
            <input
              className="input"
              value={draft.pitch}
              onChange={(e) => setDraft((d) => ({ ...d, pitch: e.target.value }))}
              placeholder="What's this role in one sentence?"
            />
          </DField>
          <DField label="Description">
            <div style={{ position: "relative" }}>
              <Wysiwyg
                value={draft.description}
                onChange={(html) => setDraft((d) => ({ ...d, description: html }))}
                minHeight={240}
              />
              {aiBusy && (
                <div
                  className="ai-shimmer"
                  style={{ position: "absolute", inset: 0, pointerEvents: "none", borderRadius: 10 }}
                />
              )}
            </div>
          </DField>
          <DField label="Requirements" hint="One per line">
            <textarea
              className="input autogrow"
              data-max-lines="15"
              value={draft.requirements}
              onChange={(e) => setDraft((d) => ({ ...d, requirements: e.target.value }))}
              style={{ fontFamily: "inherit" }}
            />
          </DField>
          <DField label="Nice to have" hint="One per line">
            <textarea
              className="input autogrow"
              data-max-lines="10"
              value={draft.niceToHave}
              onChange={(e) => setDraft((d) => ({ ...d, niceToHave: e.target.value }))}
              style={{ fontFamily: "inherit" }}
            />
          </DField>
          <DField label="Salary band">
            <input
              className="input"
              value={draft.salaryDisplay}
              onChange={(e) => setDraft((d) => ({ ...d, salaryDisplay: e.target.value }))}
              placeholder="€85k – €110k · annual"
            />
          </DField>
        </div>
      ) : (
        <div>
          {job.pitch && (
            <Glass
              faint
              style={{
                padding: 16,
                borderRadius: 12,
                marginBottom: 20,
                borderLeft: "2px solid var(--accent-solid)",
              }}
            >
              <p style={{ fontSize: 15, color: "var(--ink-0)", lineHeight: 1.5, fontStyle: "italic" }}>"{job.pitch}"</p>
            </Glass>
          )}
          <h4 style={{ marginBottom: 8 }}>About the role</h4>
          <RichText
            html={job.description}
            style={{ fontSize: 14.5, lineHeight: 1.7, color: "var(--ink-1)", marginBottom: 24 }}
            fallback={
              <p style={{ color: "var(--ink-3)", marginBottom: 24 }}>
                No description yet. Click "Edit description" to add one.
              </p>
            }
          />

          {job.requirements.length > 0 && (
            <>
              <h4 style={{ marginBottom: 8 }}>Requirements</h4>
              <ul style={{ margin: "0 0 24px", padding: 0, listStyle: "none" }}>
                {job.requirements.map((r, i) => (
                  <li key={i} className="row" style={{ alignItems: "flex-start", gap: 10, padding: "6px 0" }}>
                    <Icons.Check
                      size={14}
                      stroke={2}
                      style={{ color: "var(--accent-solid)", marginTop: 4, flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 14, lineHeight: 1.55, color: "var(--ink-1)" }}>{r}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {job.niceToHave.length > 0 && (
            <>
              <h4 style={{ marginBottom: 8 }}>Nice to have</h4>
              <div className="row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 24 }}>
                {job.niceToHave.map((n, i) => (
                  <span key={i} className="chip">{n}</span>
                ))}
              </div>
            </>
          )}

          {(job.salaryDisplay || fmtMoney(job.salaryMin, job.salaryMax, job.salaryCurrency || undefined)) && (
            <>
              <h4 style={{ marginBottom: 8 }}>Compensation</h4>
              <div style={{ fontSize: 14, color: "var(--ink-1)", marginBottom: 8 }}>
                {job.salaryDisplay || fmtMoney(job.salaryMin, job.salaryMax, job.salaryCurrency || undefined)}
              </div>
            </>
          )}
        </div>
      )}
    </Glass>
  );
}

function DField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="row" style={{ marginBottom: 5, gap: 8 }}>
        <label style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-1)" }}>{label}</label>
        {hint && <span className="tiny" style={{ marginLeft: "auto" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ScreeningTab({ job }: { job: JobShape }) {
  return (
    <Glass style={{ padding: 26, borderRadius: 16 }}>
      <div className="row" style={{ marginBottom: 16 }}>
        <h3 style={{ flex: 1 }}>Screening questions</h3>
        <button className="btn btn-sm" type="button">
          <Icons.Plus size={12} stroke={2} /> Add question
        </button>
      </div>
      {job.screening.length === 0 ? (
        <p className="muted">No screening questions yet. Candidates will only be asked the defaults.</p>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {job.screening.map((q, i) => (
            <Glass faint key={q.id} style={{ padding: 14, borderRadius: 10 }}>
              <div className="row" style={{ marginBottom: 6, gap: 8 }}>
                <span className="chip mono" style={{ height: 20, fontSize: 11 }}>
                  Q{i + 1}
                </span>
                <span className="chip">{q.kind}</span>
                {q.required && <span className="chip chip-accent">Required</span>}
                <span style={{ flex: 1 }} />
                <div className="iconbtn" style={{ width: 26, height: 26 }}>
                  <Icons.MoreH size={13} />
                </div>
              </div>
              <div style={{ fontSize: 14, color: "var(--ink-0)" }}>{q.label}</div>
            </Glass>
          ))}
        </div>
      )}
    </Glass>
  );
}

type ProcessStep = { n: string; who: string; d: string };

function ProcessTab({ job }: { job: JobShape }) {
  const router = useRouter();
  // Pre-fill with sensible defaults when the role hasn't been touched yet so
  // recruiters always see a starting point to edit rather than an empty card.
  const initial: ProcessStep[] = React.useMemo(
    () =>
      job.processSteps && job.processSteps.length > 0
        ? job.processSteps
        : [
            { n: "Intro chat", who: "Recruiter · 30 min", d: "Get to know each other and the role." },
            { n: "Working session", who: "Hiring manager · 60 min", d: "Walk through a representative problem." },
            { n: "Team meet", who: "2-3 teammates · 60 min", d: "Meet the people you'll work with day to day." },
            { n: "Offer", who: "Decision within a week", d: "We'll move fast once everyone's met." },
          ],
    [job.processSteps],
  );
  const [steps, setSteps] = React.useState<ProcessStep[]>(initial);
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  function update(i: number, patch: Partial<ProcessStep>) {
    setSteps((arr) => arr.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function move(i: number, delta: number) {
    setSteps((arr) => {
      const next = [...arr];
      const ni = i + delta;
      if (ni < 0 || ni >= next.length) return arr;
      [next[i], next[ni]] = [next[ni], next[i]];
      return next;
    });
  }
  function remove(i: number) {
    setSteps((arr) => arr.filter((_, idx) => idx !== i));
  }
  function add() {
    setSteps((arr) => [...arr, { n: "New step", who: "", d: "" }]);
  }

  async function save() {
    setBusy(true);
    const clean = steps
      .map((s) => ({ n: s.n.trim(), who: s.who.trim(), d: s.d.trim() }))
      .filter((s) => s.n || s.who || s.d);
    await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ processSteps: clean }),
    });
    setBusy(false);
    setEditing(false);
    router.refresh();
  }

  return (
    <Glass style={{ padding: 26, borderRadius: 16 }}>
      <div className="row" style={{ marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <h3>Hiring process</h3>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            What candidates can expect after they apply. Shown on the public career site.
          </p>
        </div>
        {editing ? (
          <>
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => {
                setSteps(initial);
                setEditing(false);
              }}
              disabled={busy}
            >
              Cancel
            </button>
            <button className="btn btn-sm btn-primary" type="button" onClick={save} disabled={busy}>
              <Icons.Check size={12} stroke={2} /> {busy ? "Saving…" : "Save process"}
            </button>
          </>
        ) : (
          <button className="btn btn-sm" type="button" onClick={() => setEditing(true)}>
            <Icons.FileText size={12} /> Edit process
          </button>
        )}
      </div>

      {editing ? (
        <div className="col" style={{ gap: 12 }}>
          {steps.map((step, i) => (
            <Glass faint key={i} style={{ padding: 14, borderRadius: 12 }}>
              <div className="row" style={{ gap: 8, marginBottom: 8, alignItems: "center" }}>
                <span className="chip mono" style={{ height: 22, fontSize: 11 }}>Step {i + 1}</span>
                <span style={{ flex: 1 }} />
                <button
                  type="button"
                  className="iconbtn"
                  style={{ width: 26, height: 26 }}
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move up"
                >
                  <Icons.ChevronLeft size={12} style={{ transform: "rotate(90deg)" }} />
                </button>
                <button
                  type="button"
                  className="iconbtn"
                  style={{ width: 26, height: 26 }}
                  onClick={() => move(i, 1)}
                  disabled={i === steps.length - 1}
                  aria-label="Move down"
                >
                  <Icons.ChevronDown size={12} />
                </button>
                <button
                  type="button"
                  className="iconbtn"
                  style={{ width: 26, height: 26 }}
                  onClick={() => remove(i)}
                  aria-label="Remove step"
                >
                  <Icons.Trash size={12} />
                </button>
              </div>
              <div className="col" style={{ gap: 8 }}>
                <input
                  className="input"
                  placeholder="Step name (e.g. Working session)"
                  value={step.n}
                  onChange={(e) => update(i, { n: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="Who & duration (e.g. Hiring manager · 60 min)"
                  value={step.who}
                  onChange={(e) => update(i, { who: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="What candidates can expect"
                  value={step.d}
                  onChange={(e) => update(i, { d: e.target.value })}
                />
              </div>
            </Glass>
          ))}
          <button className="btn btn-sm" type="button" onClick={add}>
            <Icons.Plus size={12} stroke={2} /> Add step
          </button>
        </div>
      ) : steps.length === 0 ? (
        <p className="muted">No hiring process defined yet. Click "Edit process" to add one.</p>
      ) : (
        <div>
          {steps.map((step, i) => (
            <div key={i} className="row" style={{ alignItems: "flex-start", gap: 14, padding: "12px 0", borderBottom: i < steps.length - 1 ? "0.5px solid var(--line)" : undefined }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  flexShrink: 0,
                  borderRadius: 8,
                  background: "var(--accent-soft)",
                  color: "var(--accent-solid)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{step.n || <span className="muted">Untitled step</span>}</div>
                {step.who && <div className="tiny" style={{ marginTop: 2, color: "var(--ink-2)" }}>{step.who}</div>}
                {step.d && <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-1)", marginTop: 6 }}>{step.d}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Glass>
  );
}

const ROLE_PRESETS = [
  "Recruiter (lead)",
  "Hiring manager",
  "Interviewer",
  "Reviewer",
  "Sourcer",
];

function TeamCard({
  job,
  members,
  canManage,
}: {
  job: JobShape;
  members: Member[];
  canManage: boolean;
}) {
  const router = useRouter();
  // Hiring team is now backed by JobHiringTeamMember (FK to User). We
  // hold the userId-keyed shape locally and PATCH the full roster on
  // each change — the server diff-replaces the join rows.
  const [team, setTeam] = React.useState(job.hiringTeam);
  const [leadReviewerId, setLeadReviewerId] = React.useState(job.leadReviewerId);
  const [adding, setAdding] = React.useState(false);
  const [pickedUserId, setPickedUserId] = React.useState<string>("");
  const [role, setRole] = React.useState(ROLE_PRESETS[1]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setTeam(job.hiringTeam);
    setLeadReviewerId(job.leadReviewerId);
  }, [job.hiringTeam, job.leadReviewerId]);

  async function patch(body: object): Promise<boolean> {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const j = await res?.json().catch(() => ({}));
      setError(j?.error === "forbidden_hiring_team" || j?.error === "forbidden_lead_reviewer"
        ? "Only admins can change the hiring team or lead reviewer."
        : "Could not save.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function persistTeam(next: typeof team) {
    setTeam(next);
    const ok = await patch({ hiringTeam: next.map((m) => ({ userId: m.userId, role: m.role })) });
    if (!ok) setTeam(job.hiringTeam);
  }

  async function persistLead(next: string | null) {
    setLeadReviewerId(next);
    const ok = await patch({ leadReviewerId: next });
    if (!ok) setLeadReviewerId(job.leadReviewerId);
  }

  async function addMember() {
    if (!pickedUserId || !role.trim()) return;
    const m = members.find((mm) => mm.id === pickedUserId);
    if (!m) return;
    if (team.some((t) => t.userId === m.id)) {
      setAdding(false);
      return;
    }
    const next = [...team, { userId: m.id, name: m.name, email: m.email, role: role.trim() }];
    await persistTeam(next);
    setAdding(false);
    setPickedUserId("");
  }

  async function removeMember(userId: string) {
    const m = team.find((t) => t.userId === userId);
    if (!m) return;
    if (!confirm(`Remove ${m.name} from the hiring team?`)) return;
    await persistTeam(team.filter((t) => t.userId !== userId));
  }

  async function updateRole(userId: string, newRole: string) {
    await persistTeam(team.map((t) => (t.userId === userId ? { ...t, role: newRole } : t)));
  }

  // Workspace members not already on the team — these are the only ones
  // the picker shows. External interviewers can be invited as workspace
  // members through Settings → Team, then added here.
  const available = members.filter((m) => !team.some((t) => t.userId === m.id));

  return (
    <Glass style={{ padding: 26, borderRadius: 16 }}>
      {/* ── Lead reviewer ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 22 }}>
        <h3 style={{ marginBottom: 4 }}>Lead reviewer</h3>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
          The recruiter who owns triaging candidates for this role. New
          applications inherit this as their reviewer; the lead can be
          reassigned per-application from the candidate profile.
        </p>
        <select
          className="select"
          value={leadReviewerId || ""}
          onChange={(e) => persistLead(e.target.value || null)}
          disabled={!canManage || busy}
          style={{ maxWidth: 360 }}
        >
          <option value="">— Unassigned —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.email})
            </option>
          ))}
        </select>
      </div>

      {/* ── Hiring team ───────────────────────────────────────────────── */}
      <div className="row" style={{ marginBottom: 16, borderTop: "0.5px solid var(--line)", paddingTop: 18 }}>
        <div style={{ flex: 1 }}>
          <h3>Hiring team</h3>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            Workspace members involved in this hire. Team members can view the candidates for this job, add notes, and write debriefs on interviews they're scheduled into.
          </p>
        </div>
        {!adding && canManage && (
          <button className="btn btn-sm" type="button" onClick={() => setAdding(true)} disabled={busy}>
            <Icons.Plus size={12} stroke={2} /> Add member
          </button>
        )}
      </div>

      {error && (
        <div className="chip chip-danger" style={{ marginBottom: 12, display: "inline-flex", padding: "6px 12px", height: "auto" }}>
          {error}
        </div>
      )}

      {adding && (
        <Glass faint style={{ padding: 14, borderRadius: 12, marginBottom: 14 }}>
          <div className="col" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 10 }}>
              <div style={{ flex: 2 }}>
                <label className="label">Person</label>
                <select
                  className="select"
                  value={pickedUserId}
                  onChange={(e) => setPickedUserId(e.target.value)}
                >
                  <option value="">Pick a teammate…</option>
                  {available.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.email})
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="label">Role on this hire</label>
                <input
                  className="input"
                  list="hiring-role-presets"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                />
                <datalist id="hiring-role-presets">
                  {ROLE_PRESETS.map((r) => <option key={r} value={r} />)}
                </datalist>
              </div>
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-sm" type="button" onClick={() => setAdding(false)} disabled={busy}>
                Cancel
              </button>
              <button
                className="btn btn-sm btn-primary"
                type="button"
                onClick={addMember}
                disabled={busy || !pickedUserId || !role.trim()}
              >
                <Icons.Plus size={12} stroke={2} /> Add to team
              </button>
            </div>
          </div>
        </Glass>
      )}

      {team.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No one on the hiring team yet. Click "Add member" to assign a teammate.
        </p>
      ) : (
        <div className="col" style={{ gap: 8 }}>
          {team.map((m) => (
            <Glass faint key={m.userId} style={{ padding: 12, borderRadius: 10 }}>
              <div className="row" style={{ gap: 12, alignItems: "center" }}>
                <Avatar name={m.name} size="md" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500 }}>{m.name}</span>
                    {m.userId === leadReviewerId && (
                      <span className="chip" style={{ height: 18, fontSize: 10, background: "var(--accent-soft)", color: "var(--accent-solid)", borderColor: "transparent" }}>
                        Lead reviewer
                      </span>
                    )}
                  </div>
                  <input
                    className="input"
                    value={m.role}
                    onChange={(e) =>
                      setTeam((arr) => arr.map((t) => (t.userId === m.userId ? { ...t, role: e.target.value } : t)))
                    }
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      const original = job.hiringTeam.find((t) => t.userId === m.userId)?.role || "";
                      if (v && v !== original) updateRole(m.userId, v);
                    }}
                    disabled={!canManage}
                    list="hiring-role-presets"
                    style={{ marginTop: 4, height: 30, fontSize: 12.5, background: "transparent", padding: "0 6px" }}
                  />
                </div>
                {canManage && (
                  <button
                    type="button"
                    className="iconbtn"
                    onClick={() => removeMember(m.userId)}
                    disabled={busy}
                    title="Remove from team"
                    aria-label={`Remove ${m.name}`}
                  >
                    <Icons.Trash size={13} />
                  </button>
                )}
              </div>
            </Glass>
          ))}
        </div>
      )}
    </Glass>
  );
}

function PublishingTab({
  job,
  workspaceSlug,
  publicDomain,
  onToggle,
}: {
  job: JobShape;
  workspaceSlug: string;
  publicDomain: string;
  onToggle: (key: string, value: boolean) => Promise<void>;
}) {
  const publicUrl = `http://${workspaceSlug}.${publicDomain}/jobs/${job.slug}`;
  const channels: { key: string; name: string; sub: string; icon: keyof typeof Icons }[] = [
    { key: "vellum", name: `${workspaceSlug} careers`, sub: `${publicUrl} · branded`, icon: "Globe" },
    { key: "linkedin", name: "LinkedIn Jobs", sub: "Free posting · syncs every 24h", icon: "Linkedin" },
    { key: "indeed", name: "Indeed", sub: "Free posting · syncs every 24h", icon: "Briefcase" },
    { key: "otta", name: "Otta", sub: "Pre-screened candidates · paid", icon: "Star" },
    { key: "hn", name: "Hacker News Who's Hiring", sub: "First Monday of month", icon: "FileText" },
  ];
  return (
    <Glass style={{ padding: 26, borderRadius: 16 }}>
      <h3 style={{ marginBottom: 4 }}>Where it's published</h3>
      <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
        Vellum syncs this listing across the channels you've enabled.
      </p>
      <div className="col" style={{ gap: 10 }}>
        {channels.map((c) => {
          const I = (Icons as any)[c.icon] || Icons.Globe;
          // Vellum career site is always live when the job is Open — toggle is read-only.
          const isVellum = c.key === "vellum";
          const on = isVellum ? job.status === "Open" : !!job.channels[c.key];
          return (
            <Glass
              faint
              key={c.key}
              style={{ padding: 14, borderRadius: 12, display: "flex", alignItems: "center", gap: 14 }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: "var(--glass-bg)",
                  border: "0.5px solid var(--line)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--ink-1)",
                }}
              >
                <I size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{c.name}</div>
                <div className="tiny">{c.sub}</div>
              </div>
              {on && (
                <span className="chip chip-accent">
                  <span className="chip-dot" style={{ background: "var(--accent-solid)" }} /> Live
                </span>
              )}
              <button
                type="button"
                className={`switch ${on ? "on" : ""}`}
                disabled={isVellum}
                onClick={() => !isVellum && onToggle(c.key, !on)}
                aria-label={`Toggle ${c.name}`}
              />
            </Glass>
          );
        })}
      </div>
      <p className="tiny muted" style={{ marginTop: 14 }}>
        External channels (LinkedIn / Indeed / Otta / HN) are toggles in the OSS edition — credential sync is part
        of the SaaS roadmap.
      </p>
    </Glass>
  );
}

function JobAnalytics({ job, stages }: { job: JobShape; stages: StageStat[] }) {
  return (
    <Glass style={{ padding: 26, borderRadius: 16 }}>
      <h3 style={{ marginBottom: 18 }}>Funnel & conversion</h3>
      <div className="col" style={{ gap: 14 }}>
        {stages.map((s) => {
          const pct = (s.count / Math.max(1, job.applicantCount)) * 100;
          return (
            <div key={s.key}>
              <div className="row" style={{ marginBottom: 5 }}>
                <span
                  className="chip-dot"
                  style={{ background: s.color, marginRight: 8, width: 7, height: 7, borderRadius: "50%", display: "inline-block" }}
                />
                <span style={{ fontSize: 13, flex: 1 }}>{s.name}</span>
                <span className="mono tiny">
                  {s.count} · {pct.toFixed(0)}%
                </span>
              </div>
              <div className="funnel-bar">
                <div className="funnel-fill" style={{ width: `${Math.max(2, pct)}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="divider" style={{ margin: "26px 0" }} />

      <h3 style={{ marginBottom: 12 }}>Pipeline pulse</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <Stat2 v={`${job.avgAge}d`} l="Avg. application age" />
        <Stat2 v={job.newThisWeek} l="New this week" accent={job.newThisWeek > 0} />
        <Stat2
          v={
            job.publishedAt
              ? relativeTime(job.publishedAt)
              : "—"
          }
          l="Published"
          small
        />
      </div>
    </Glass>
  );
}
