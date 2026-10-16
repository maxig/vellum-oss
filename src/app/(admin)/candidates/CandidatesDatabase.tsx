// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useValueLabels } from "@/i18n/labels";
import { Glass, Chip, Avatar, Stars, Icons } from "@/components/primitives";
import { useRelativeTime } from "@/i18n/format";
import ProfileSheet from "@/components/ProfileSheet";

type Stage = { id: string; key: string; name: string; color: string };
type Job = { id: string; title: string; status: string };
type PulseBand = "hot" | "warm" | "cool" | "cold" | "silent" | "locked";
type CandidateRow = {
  id: string;
  name: string;
  email: string | null;
  location: string | null;
  currentRole: string | null;
  source: string | null;
  skills: string[];
  createdAt: string;
  threadId: string | null;
  pulseScore: number | null;
  pulseBand: string | null;
  rating: number | null;
  ratingCount: number;
  application: null | {
    id: string;
    jobId: string;
    jobTitle: string;
    stageId: string | null;
    stageKey: string | null;
    stageName: string;
    stageColor: string;
    aiFit: number | null;
    appliedAt: string;
    archived: boolean;
  };
};

// Labels: common.pulse.bands.<band>
const BAND_META: Record<PulseBand, { emoji: string; dot: string; tint: string; ink: string }> = {
  hot: { emoji: "🔥", dot: "oklch(70% 0.18 28)", tint: "color-mix(in oklab, oklch(70% 0.18 28) 14%, transparent)", ink: "oklch(55% 0.18 28)" },
  warm: { emoji: "☀", dot: "oklch(72% 0.13 80)", tint: "color-mix(in oklab, oklch(72% 0.13 80) 12%, transparent)", ink: "oklch(50% 0.14 80)" },
  cool: { emoji: "🌤", dot: "oklch(72% 0.12 230)", tint: "color-mix(in oklab, oklch(72% 0.12 230) 14%, transparent)", ink: "oklch(50% 0.14 230)" },
  cold: { emoji: "❄️", dot: "oklch(60% 0.16 28)", tint: "color-mix(in oklab, oklch(60% 0.16 28) 16%, transparent)", ink: "oklch(50% 0.18 28)" },
  silent: { emoji: "💤", dot: "oklch(70% 0.02 250)", tint: "var(--glass-bg-faint)", ink: "var(--ink-2)" },
  locked: { emoji: "✖", dot: "oklch(50% 0.02 250)", tint: "var(--glass-bg-faint)", ink: "var(--ink-2)" },
};

type Sort = "recent" | "score" | "rated" | "name";

export default function CandidatesDatabase({
  candidates,
  stages,
  jobs,
  currentUser,
  currentRole,
}: {
  candidates: CandidateRow[];
  stages: Stage[];
  jobs: Job[];
  currentUser?: { id: string; name: string; signature: string };
  currentRole?: string;
}) {
  const canDelete = currentRole === "owner" || currentRole === "admin";
  const router = useRouter();
  const t = useTranslations("candidates.db");
  const tc = useTranslations("common");
  const [rows, setRows] = React.useState(candidates);
  const [q, setQ] = React.useState("");
  const [stage, setStage] = React.useState("any");
  const [source, setSource] = React.useState("any");
  const [minScore, setMinScore] = React.useState(0);
  const [pulseFilter, setPulseFilter] = React.useState("any"); // any | cooling | hot
  const [sort, setSort] = React.useState<Sort>("recent");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkStageId, setBulkStageId] = React.useState(stages[0]?.id || "");
  const [tagText, setTagText] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [openApplicationId, setOpenApplicationId] = React.useState<string | null>(null);

  React.useEffect(() => setRows(candidates), [candidates]);
  React.useEffect(() => setSelected(new Set()), [minScore, q, sort, source, stage]);

  const activeRows = React.useMemo(() => rows.filter((r) => !r.application?.archived), [rows]);
  const sources = React.useMemo(() => Array.from(new Set(activeRows.map((r) => r.source).filter(Boolean))) as string[], [activeRows]);

  const filtered = React.useMemo(() => {
    let list = activeRows.filter((c) => {
      if (stage !== "any" && c.application?.stageKey !== stage) return false;
      if (source !== "any" && c.source !== source) return false;
      if (minScore > 0 && (c.application?.aiFit || 0) < minScore) return false;
      if (pulseFilter === "cooling" && !(c.pulseBand === "cool" || c.pulseBand === "cold" || c.pulseBand === "silent")) return false;
      if (pulseFilter === "hot" && c.pulseBand !== "hot") return false;
      if (q.trim()) {
        const hay = [
          c.name,
          c.email,
          c.location,
          c.currentRole,
          c.source,
          c.application?.jobTitle,
          c.skills.join(" "),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
    if (sort === "score") list = [...list].sort((a, b) => (b.application?.aiFit || 0) - (a.application?.aiFit || 0));
    if (sort === "rated") list = [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    if (sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [activeRows, minScore, q, sort, source, stage, pulseFilter]);

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const selectedApps = selectedRows.map((r) => r.application).filter(Boolean) as NonNullable<CandidateRow["application"]>[];

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast((current) => current === message ? null : current), 2600);
  }

  function toggleAll() {
    if (filtered.length > 0 && selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((c) => c.id)));
  }

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function moveApplications(apps: NonNullable<CandidateRow["application"]>[], stageId: string) {
    if (!stageId || apps.length === 0) return;
    setBusy("move");
    const nextStage = stages.find((s) => s.id === stageId);
    try {
      // Track each request's outcome — a member moving a candidate they don't
      // own gets a 403; only update the rows that actually moved, and report
      // the true count instead of claiming success for all.
      const results = await Promise.all(
        apps.map((app) =>
          fetch(`/api/applications/${app.id}`, { method: "PATCH", body: JSON.stringify({ stageId }) })
            .then((r) => ({ id: app.id, ok: r.ok }))
            .catch(() => ({ id: app.id, ok: false })),
        ),
      );
      const movedIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
      if (movedIds.size > 0 && nextStage) {
        setRows((current) =>
          current.map((row) =>
            row.application && movedIds.has(row.application.id)
              ? { ...row, application: { ...row.application, stageId, stageKey: nextStage.key, stageName: nextStage.name, stageColor: nextStage.color } }
              : row,
          ),
        );
      }
      setSelected(new Set());
      flash(
        movedIds.size < apps.length
          ? t("movedPartial", { done: movedIds.size, total: apps.length })
          : t("moved", { count: movedIds.size }),
      );
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function deleteSelected() {
    if (selectedRows.length === 0) return;
    const ok = window.confirm(t("confirmDeleteMany", { count: selectedRows.length }));
    if (!ok) return;
    setBusy("delete");
    try {
      const results = await Promise.all(
        selectedRows.map((row) =>
          fetch(`/api/candidates/${row.id}`, { method: "DELETE" })
            .then((r) => ({ id: row.id, ok: r.ok }))
            .catch(() => ({ id: row.id, ok: false })),
        ),
      );
      // Only drop the rows that actually deleted — a failed one should stay
      // visible rather than vanish and reappear on refresh.
      const okIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
      setRows((current) => current.filter((row) => !okIds.has(row.id)));
      setSelected(new Set());
      flash(
        okIds.size < selectedRows.length
          ? t("removedPartial", { done: okIds.size, total: selectedRows.length })
          : t("removed", { count: okIds.size }),
      );
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function deleteCandidate(candidateId: string, name: string) {
    const ok = window.confirm(t("confirmDelete", { name }));
    if (!ok) return;
    const res = await fetch(`/api/candidates/${candidateId}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      flash(json?.error === "forbidden" ? t("deleteForbidden") : t("deleteFailed"));
      return;
    }
    setRows((current) => current.filter((row) => row.id !== candidateId));
    flash(t("removedOne", { name }));
    router.refresh();
  }

  async function addTagToSelected() {
    const tag = tagText.trim();
    if (!tag || selectedRows.length === 0) return;
    setBusy("tag");
    try {
      const results = await Promise.all(
        selectedRows.map((row) =>
          fetch(`/api/candidates/${row.id}`, { method: "PATCH", body: JSON.stringify({ addSkill: tag }) })
            .then((r) => ({ id: row.id, ok: r.ok }))
            .catch(() => ({ id: row.id, ok: false })),
        ),
      );
      const okIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
      setRows((current) =>
        current.map((row) => (okIds.has(row.id) && !row.skills.includes(tag) ? { ...row, skills: [...row.skills, tag] } : row)),
      );
      setTagText("");
      setSelected(new Set());
      flash(
        okIds.size < selectedRows.length
          ? t("taggedPartial", { done: okIds.size, total: selectedRows.length })
          : t("tagged", { tag, count: okIds.size }),
      );
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function messageSelected() {
    if (selectedRows.length === 0) return;
    setBusy("message");
    try {
      let firstThread = selectedRows.find((row) => row.threadId)?.threadId || null;
      for (const row of selectedRows) {
        if (row.threadId) continue;
        const res = await fetch("/api/threads", {
          method: "POST",
          body: JSON.stringify({
            candidateId: row.id,
            jobId: row.application?.jobId,
            subject: `Re: ${row.application?.jobTitle || t("application")}`,
          }),
        }).catch(() => null);
        if (!res?.ok) continue;
        const json = await res.json().catch(() => null);
        if (!firstThread && json?.id) firstThread = json.id;
      }
      if (firstThread) router.push(`/inbox?thread=${firstThread}`);
      else flash(t("messageFailed"));
    } finally {
      setBusy(null);
    }
  }

  function clearFilters() {
    setQ("");
    setStage("any");
    setSource("any");
    setMinScore(0);
    setPulseFilter("any");
  }

  const filtersActive = q || stage !== "any" || source !== "any" || minScore > 0 || pulseFilter !== "any";

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 22, alignItems: "flex-end", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 28 }}>{t("title")}</h1>
          <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
            {t("summary", { total: activeRows.length, active: activeRows.filter((c) => c.application?.stageKey !== "hired").length })}
          </p>
        </div>
        <button className="btn" onClick={() => setAddOpen(true)}><Icons.Plus size={13} stroke={2} /> {t("add")}</button>
        <button className="btn" onClick={() => window.open("/api/workspace/export", "_blank")}><Icons.ArrowUpRight size={12} stroke={2} /> {t("export")}</button>
      </div>

      <Glass style={{ padding: 12, marginBottom: 14, borderRadius: 14 }}>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <Glass faint style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderRadius: 9, height: 34, flex: 1, minWidth: 260 }}>
            <Icons.Search size={14} style={{ color: "var(--ink-2)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchPlaceholder")}
              style={{ background: "transparent", border: 0, outline: 0, color: "var(--ink-0)", fontSize: 13, width: "100%" }}
            />
          </Glass>
          <FilterSelect label={t("filters.stage")} value={stage} onChange={setStage} options={[{ value: "any", label: t("filters.anyStage") }, ...stages.map((s) => ({ value: s.key, label: s.name }))]} />
          <FilterSelect label={t("filters.source")} value={source} onChange={setSource} options={[{ value: "any", label: t("filters.anySource") }, ...sources.map((s) => ({ value: s, label: s }))]} />
          <FilterSelect label={t("filters.minScore")} value={String(minScore)} onChange={(v) => setMinScore(Number(v))} options={[{ value: "0", label: t("filters.anyScore") }, { value: "70", label: ">= 70" }, { value: "80", label: ">= 80" }, { value: "90", label: ">= 90" }]} />
          <FilterSelect label={t("filters.pulse")} value={pulseFilter} onChange={setPulseFilter} options={[{ value: "any", label: t("filters.anyPulse") }, { value: "hot", label: t("filters.hotOnly") }, { value: "cooling", label: t("filters.cooling") }]} />
          <FilterSelect label={t("filters.sort")} value={sort} onChange={(v) => setSort(v as Sort)} options={[{ value: "recent", label: t("filters.recent") }, { value: "score", label: t("filters.aiFit") }, { value: "rated", label: t("filters.topRated") }, { value: "name", label: t("filters.name") }]} />
        </div>
        {filtersActive && (
          <div className="row" style={{ marginTop: 10, gap: 6 }}>
            <span className="tiny">{t("filteredCount", { shown: filtered.length, total: activeRows.length })}</span>
            <span style={{ flex: 1 }} />
            <button className="btn btn-sm btn-ghost" onClick={clearFilters}>{t("clearFilters")} <Icons.X size={11} /></button>
          </div>
        )}
      </Glass>

      {selected.size > 0 && (
        <Glass style={{
          padding: "10px 16px",
          marginBottom: 12,
          borderRadius: 10,
          background: "linear-gradient(135deg, color-mix(in oklab, var(--accent-1) 10%, var(--glass-bg)), color-mix(in oklab, var(--accent-2) 8%, var(--glass-bg)))",
        }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{t("selected", { count: selected.size })}</span>
            <button className="btn btn-sm" disabled={busy === "message"} onClick={messageSelected}><Icons.Mail size={12} /> {t("message")}</button>
            <select className="select" value={bulkStageId} onChange={(e) => setBulkStageId(e.target.value)} style={{ width: 150, height: 28, fontSize: 12 }}>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="btn btn-sm" disabled={busy === "move" || selectedApps.length === 0} onClick={() => moveApplications(selectedApps, bulkStageId)}>
              <Icons.Pipeline size={12} /> {t("moveStage")}
            </button>
            <input
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              placeholder={t("tagPlaceholder")}
              style={{ width: 120, height: 28, borderRadius: 8, border: "0.5px solid var(--line)", background: "var(--glass-bg-faint)", padding: "0 9px", color: "var(--ink-0)" }}
            />
            <button className="btn btn-sm" disabled={busy === "tag" || !tagText.trim()} onClick={addTagToSelected}><Icons.Plus size={12} /> {t("addTag")}</button>
            <span style={{ flex: 1 }} />
            {canDelete && (
              <button
                className="btn btn-sm btn-ghost"
                disabled={busy === "delete"}
                onClick={deleteSelected}
                style={{ color: "oklch(50% 0.18 28)" }}
              >
                <Icons.Trash size={12} /> {tc("delete")}
              </button>
            )}
            <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>{tc("cancel")}</button>
          </div>
        </Glass>
      )}

      <Glass style={{ overflow: "hidden", borderRadius: 14 }}>
        <div className="candidate-db-row candidate-db-head">
          <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleAll} aria-label={t("selectAll")} />
          <span className="tiny">{t("cols.candidate")}</span>
          <span className="tiny">{t("cols.role")}</span>
          <span className="tiny">{t("cols.stage")}</span>
          <span className="tiny">{t("cols.source")}</span>
          <span className="tiny" style={{ textAlign: "right" }}>{t("cols.aiFit")}</span>
          <span className="tiny" style={{ textAlign: "right" }}>{t("cols.rating")}</span>
          <span className="tiny" style={{ textAlign: "right" }}>{t("cols.applied")}</span>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-2)", fontSize: 13 }}>{t("noMatch")}</div>
        )}
        {filtered.map((candidate, i) => (
          <CandidateRecord
            key={candidate.id}
            candidate={candidate}
            checked={selected.has(candidate.id)}
            stages={stages}
            isLast={i === filtered.length - 1}
            onOpen={() => {
              if (candidate.application) setOpenApplicationId(candidate.application.id);
              else router.push(`/candidates/${candidate.id}`);
            }}
            onToggle={() => toggleOne(candidate.id)}
            onMove={(stageId) => candidate.application && moveApplications([candidate.application], stageId)}
            onDelete={canDelete ? () => deleteCandidate(candidate.id, candidate.name) : null}
          />
        ))}
      </Glass>

      {addOpen && (
        <AddCandidateModal
          jobs={jobs}
          stages={stages}
          onClose={() => setAddOpen(false)}
          onCreated={(id) => {
            setAddOpen(false);
            flash(t("added"));
            router.refresh();
            router.push(`/candidates/${id}`);
          }}
        />
      )}

      {openApplicationId && (
        <ProfileSheet
          applicationId={openApplicationId}
          stages={stages}
          currentUser={currentUser ?? { id: "current", name: t("you"), signature: "" }}
          currentRole={currentRole}
          onClose={() => setOpenApplicationId(null)}
          onChanged={() => router.refresh()}
        />
      )}

      {toast && (
        <div style={{
          position: "fixed",
          bottom: 28,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 200,
          padding: "10px 16px",
          borderRadius: 12,
          background: "var(--glass-bg-strong)",
          border: "0.5px solid var(--glass-border)",
          backdropFilter: "blur(20px) saturate(160%)",
          boxShadow: "0 12px 32px -8px rgba(20,20,50,0.25), 0 1px 0 rgba(255,255,255,0.4) inset",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 13.5,
          fontWeight: 500,
        }}>
          <Icons.Check size={14} stroke={2.2} style={{ color: "var(--accent-solid)" }} />
          {toast}
        </div>
      )}
    </div>
  );
}

function CandidateRecord({
  candidate,
  checked,
  stages,
  isLast,
  onOpen,
  onToggle,
  onMove,
  onDelete,
}: {
  candidate: CandidateRow;
  checked: boolean;
  stages: Stage[];
  isLast: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onMove: (stageId: string) => void;
  onDelete: (() => void) | null;
}) {
  const t = useTranslations("candidates.db");
  const relativeTime = useRelativeTime();
  const stage = candidate.application;
  return (
    <div
      className="candidate-db-row candidate-db-record"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      aria-label={t("openLabel", { name: candidate.name })}
      onKeyDown={(e) => {
        // Don't hijack keys typed into the row's stage <select> or checkbox.
        if ((e.target as HTMLElement).closest("select, input, button")) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        borderBottom: isLast ? "none" : "0.5px solid var(--line)",
        background: checked ? "var(--accent-soft)" : "transparent",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onClick={(e) => e.stopPropagation()}
        onChange={onToggle}
        aria-label={t("selectLabel", { name: candidate.name })}
      />
      <div className="row" style={{ gap: 10, minWidth: 0 }}>
        <Avatar name={candidate.name} size="md" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{candidate.name}</div>
          <div className="tiny" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{candidate.location || candidate.email || t("noLocation")}</div>
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--ink-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {stage?.jobTitle || candidate.currentRole || t("noRole")}
        </div>
        <div className="row" style={{ gap: 4, marginTop: 3, overflow: "hidden" }}>
          {candidate.skills.slice(0, 2).map((skill) => <span key={skill} className="chip" style={{ height: 17, fontSize: 10, padding: "0 6px" }}>{skill}</span>)}
        </div>
      </div>
      <div>
        {stage ? (
          <select
            className="select"
            value={stage.stageId || ""}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onMove(e.target.value)}
            style={{
              width: 142,
              height: 28,
              fontSize: 12,
              color: "var(--ink-0)",
              borderColor: "transparent",
              background: `color-mix(in oklab, ${stage.stageColor} 18%, transparent)`,
            }}
          >
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        ) : (
          <span className="tiny">{t("noApplication")}</span>
        )}
      </div>
      <div className="tiny">{candidate.source || "—"}</div>
      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
        <ScorePill score={stage?.aiFit || null} />
        <PulsePill candidateId={candidate.id} score={candidate.pulseScore} band={candidate.pulseBand} />
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        {candidate.rating != null && candidate.ratingCount > 0 ? (
          <Stars value={candidate.rating} size={12} showValue count={candidate.ratingCount} />
        ) : (
          <span className="tiny muted">—</span>
        )}
      </div>
      <div className="row" style={{ justifyContent: "flex-end", gap: 4 }}>
        <span className="tiny mono">{stage ? relativeTime(stage.appliedAt) : relativeTime(candidate.createdAt)}</span>
        {onDelete && (
          <button
            className="iconbtn"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            aria-label={t("deleteLabel", { name: candidate.name })}
            title={t("deleteTitle")}
            style={{ width: 24, height: 24, color: "var(--ink-2)" }}
          >
            <Icons.Trash size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

type PulseSignalAPI = { id: string; kind: string; polarity: "pos" | "neg"; weight: number; at: string };
type PulseBreakdownAPI = {
  candidateId: string;
  score: number;
  band: PulseBand;
  baseline: number;
  updatedAt: string | null;
  signals: PulseSignalAPI[];
  sparkline: number[];
};

function PulsePill({ candidateId, score, band }: { candidateId: string; score: number | null; band: string | null }) {
  const tp = useTranslations("common.pulse");
  const tc = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<PulseBreakdownAPI | null>(null);
  const [loading, setLoading] = React.useState(false);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!popoverRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function openBreakdown(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && !data) {
      setLoading(true);
      try {
        const r = await fetch(`/api/pulse/${candidateId}`);
        if (r.ok) setData(await r.json());
      } finally {
        setLoading(false);
      }
    }
    setOpen((o) => !o);
  }

  if (typeof score !== "number" || !band) {
    return <span className="tiny" style={{ minWidth: 56, textAlign: "right" }}>—</span>;
  }
  const bandKey = (band in BAND_META ? band : "warm") as PulseBand;
  const meta = BAND_META[bandKey];
  const bandLabel = tp(`bands.${bandKey}`);

  return (
    <div style={{ position: "relative" }} ref={popoverRef}>
      <button
        onClick={openBreakdown}
        title={`Pulse · ${bandLabel}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "2px 8px",
          height: 22,
          borderRadius: 999,
          fontSize: 11.5,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          background: meta.tint,
          color: meta.ink,
          border: "0.5px solid var(--line)",
          cursor: "pointer",
        }}
      >
        <span className="chip-dot" style={{ width: 6, height: 6, borderRadius: 999, background: meta.dot }} />
        {score}
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 320,
            zIndex: 50,
            background: "var(--glass-bg-strong)",
            backdropFilter: "blur(22px)",
            WebkitBackdropFilter: "blur(22px)",
            border: "0.5px solid var(--glass-border)",
            borderRadius: 12,
            padding: 14,
            boxShadow: "0 10px 40px rgba(0,0,0,0.25)",
            textAlign: "left",
          }}
        >
          <div className="row" style={{ marginBottom: 8, alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-0)" }}>
              Pulse · {score} {meta.emoji}
            </span>
            <span style={{ flex: 1 }} />
            <span className="tiny">{bandLabel}</span>
          </div>
          {loading && <div className="tiny">{tc("loading")}</div>}
          {data && (
            <>
              <Sparkline data={data.sparkline} />
              <div style={{ marginTop: 10, borderTop: "0.5px solid var(--line)", paddingTop: 10 }}>
                <div className="tiny" style={{ marginBottom: 6, color: "var(--ink-2)" }}>
                  {tp("signalsTitle")}
                </div>
                {data.signals.length === 0 ? (
                  <div className="tiny">{tp("noSignals")}</div>
                ) : (
                  <div className="col" style={{ gap: 4 }}>
                    {data.signals.slice(0, 6).map((s) => (
                      <div key={s.id} className="row" style={{ gap: 8, fontSize: 12 }}>
                        <span
                          style={{
                            color: s.polarity === "neg" ? "oklch(55% 0.18 28)" : "var(--accent-solid)",
                            fontVariantNumeric: "tabular-nums",
                            minWidth: 20,
                            textAlign: "right",
                          }}
                        >
                          {s.polarity === "neg" ? "−" : "+"}
                          {s.weight}
                        </span>
                        <span style={{ flex: 1, color: "var(--ink-1)" }}>{prettySignal(s.kind, tp)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="tiny" style={{ marginTop: 8, color: "var(--ink-2)" }}>
                {tp("baseline", { value: data.baseline })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const max = 100;
  const h = 28;
  return (
    <div className="row" style={{ gap: 2, alignItems: "flex-end", height: h }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${Math.max(3, (v / max) * h)}px`,
            background: "linear-gradient(180deg, var(--accent-1), var(--accent-2))",
            borderRadius: 1,
            opacity: i === data.length - 1 ? 1 : 0.7,
          }}
          title={`Day -${data.length - 1 - i}: ${v}`}
        />
      ))}
    </div>
  );
}

const SIGNAL_KINDS = new Set([
  "message_received", "message_fast_reply", "message_long_reply", "positive_sentiment",
  "question_asked", "link_clicked", "email_opened", "no_reply_overdue", "no_open",
  "stage_idle", "negative_sentiment", "reschedule_requested", "interview_no_show",
  "unsubscribe", "stage_advanced", "offer_sent",
]);

function prettySignal(kind: string, tp: ReturnType<typeof useTranslations<"common.pulse">>): string {
  return SIGNAL_KINDS.has(kind) ? tp(`signals.${kind as "message_received"}`) : kind;
}

function ScorePill({ score }: { score: number | null }) {
  if (typeof score !== "number") return <span className="tiny">—</span>;
  const high = score >= 85;
  const mid = score >= 70;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 32,
      padding: "2px 8px",
      height: 22,
      borderRadius: 999,
      fontSize: 11.5,
      fontWeight: 600,
      fontVariantNumeric: "tabular-nums",
      background: high ? "color-mix(in oklab, var(--accent-solid) 14%, transparent)" : mid ? "var(--glass-bg-faint)" : "color-mix(in oklab, oklch(60% 0.18 30) 12%, transparent)",
      color: high ? "var(--accent-solid)" : mid ? "var(--ink-1)" : "oklch(50% 0.16 30)",
      border: `0.5px solid ${high ? "color-mix(in oklab, var(--accent-solid) 30%, transparent)" : "var(--line)"}`,
    }}>{score}</span>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: "none",
          WebkitAppearance: "none",
          background: "var(--glass-bg-faint)",
          border: "0.5px solid var(--line)",
          borderRadius: 9,
          padding: "0 30px 0 12px",
          height: 34,
          fontSize: 13,
          color: "var(--ink-0)",
          fontFamily: "inherit",
          cursor: "default",
          minWidth: 130,
        }}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{label}: {option.label}</option>)}
      </select>
      <Icons.ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--ink-2)" }} />
    </div>
  );
}

function AddCandidateModal({
  jobs,
  stages,
  onClose,
  onCreated,
}: {
  jobs: Job[];
  stages: Stage[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations("candidates.add");
  const tc = useTranslations("common");
  const labels = useValueLabels();
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    location: "",
    currentRole: "",
    source: t("defaultSource"),
    years: "",
    skills: "",
    jobId: jobs.find((j) => j.status === "Open")?.id || jobs[0]?.id || "",
    stageId: stages[0]?.id || "",
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function set(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/candidates", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        years: form.years ? Number(form.years) : null,
        skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(json.error || t("failed"));
      return;
    }
    onCreated(json.id);
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form onSubmit={submit} className="sheet glass glass-strong" style={{ width: "min(720px, calc(100vw - 48px))", height: "auto", maxHeight: "calc(100vh - 48px)" }}>
        <div style={{ padding: "18px 24px", borderBottom: "0.5px solid var(--line)" }}>
          <div className="row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="topbar-crumb">{t("crumb")}</div>
              <h2 style={{ fontSize: 18 }}>{t("title")}</h2>
            </div>
            <button type="button" className="iconbtn" onClick={onClose} aria-label={tc("close")}><Icons.X size={15} /></button>
          </div>
        </div>
        <div className="scroll" style={{ flex: 1, padding: "22px 24px", overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t("name")} required><input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Amelia Chen" required /></Field>
            <Field label={t("email")}><input className="input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder={t("emailPlaceholder")} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t("location")}><input className="input" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Berlin, DE" /></Field>
            <Field label={t("currentRole")}><input className="input" value={form.currentRole} onChange={(e) => set("currentRole", e.target.value)} placeholder="Senior Designer @ N26" /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t("source")}><input className="input" value={form.source} onChange={(e) => set("source", e.target.value)} /></Field>
            <Field label={t("years")}><input className="input" type="number" min="0" max="80" value={form.years} onChange={(e) => set("years", e.target.value)} placeholder="7" /></Field>
          </div>
          <Field label={t("skills")}><input className="input" value={form.skills} onChange={(e) => set("skills", e.target.value)} placeholder="Design Systems, B2B, Research" /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t("job")}>
              <select className="select" value={form.jobId} onChange={(e) => set("jobId", e.target.value)}>
                <option value="">{t("noApplication")}</option>
                {jobs.map((job) => <option key={job.id} value={job.id}>{job.title} · {labels.jobStatus(job.status)}</option>)}
              </select>
            </Field>
            <Field label={t("stage")}>
              <select className="select" value={form.stageId} onChange={(e) => set("stageId", e.target.value)} disabled={!form.jobId}>
                {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
              </select>
            </Field>
          </div>
          {error && <div className="chip chip-danger" style={{ marginTop: 4 }}>{error}</div>}
        </div>
        <div className="row" style={{ padding: "12px 22px", borderTop: "0.5px solid var(--line)" }}>
          <span className="tiny" style={{ flex: 1 }}>{t("hint")}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>{tc("cancel")}</button>
          <button className="btn btn-sm btn-primary" disabled={saving || !form.name.trim()} type="submit">
            {saving ? t("adding") : t("submit")}
          </button>
        </div>
      </form>
    </>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span className="label">{label}{required && <span style={{ color: "var(--accent-solid)", marginLeft: 3 }}>*</span>}</span>
      {children}
    </label>
  );
}
