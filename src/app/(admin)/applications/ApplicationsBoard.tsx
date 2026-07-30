// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Avatar, Stars } from "@/components/primitives";
import { Icons } from "@/components/Icons";
import ProfileSheet from "@/components/ProfileSheet";
import { relativeTime } from "@/lib/utils";

type Stage = { id: string; key: string; name: string; color: string };
type Job = {
  id: string;
  title: string;
  status: string;
  department: string;
  location: string;
  mine: boolean;
};
type App = {
  id: string;
  jobId: string;
  stageId: string | null;
  aiFit: number | null;
  outcome: string | null;
  appliedAt: string;
  stageEnteredAt: string;
  rating: { avg: number; count: number } | null;
  unread: boolean;
  candidate: {
    id: string;
    name: string;
    email: string | null;
    currentRole: string;
    location: string;
    skills: string[];
  };
};

const PIPELINE_KEYS = ["applied", "screen", "interview", "offer", "hired"];
const PREFS_KEY = "vellum.applications.prefs";

type Prefs = { view: "board" | "list"; scope: "mine" | "all"; hideEmpty: boolean };

export default function ApplicationsBoard({
  currentUser,
  stages,
  jobs,
  applications,
}: {
  currentUser: { id: string; name: string; signature: string };
  stages: Stage[];
  jobs: Job[];
  applications: App[];
}) {
  const router = useRouter();

  const visibleStages = React.useMemo(
    () =>
      stages
        .filter((s) => PIPELINE_KEYS.includes(s.key))
        .sort((a, b) => PIPELINE_KEYS.indexOf(a.key) - PIPELINE_KEYS.indexOf(b.key)),
    [stages],
  );

  const hasMine = jobs.some((j) => j.mine);

  const [items, setItems] = React.useState<App[]>(applications);
  const [view, setView] = React.useState<"board" | "list">("board");
  const [scope, setScope] = React.useState<"mine" | "all">(hasMine ? "mine" : "all");
  const [hideEmpty, setHideEmpty] = React.useState(false);
  // Start with jobs that have no applicants collapsed — an expanded board of
  // five empty stages is just noise. Jobs with candidates open by default.
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => {
    const counts = new Map<string, number>();
    for (const a of applications) counts.set(a.jobId, (counts.get(a.jobId) ?? 0) + 1);
    return new Set(jobs.filter((j) => (counts.get(j.id) ?? 0) === 0).map((j) => j.id));
  });
  const [query, setQuery] = React.useState("");
  const [topRated, setTopRated] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setItems(applications);
    setSelectedId((id) => (id && applications.some((a) => a.id === id) ? id : null));
  }, [applications]);

  // Hydrate view prefs from localStorage after mount (avoids SSR mismatch).
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Partial<Prefs>;
      if (p.view === "board" || p.view === "list") setView(p.view);
      if (p.scope === "mine" || p.scope === "all") setScope(hasMine ? p.scope : "all");
      if (typeof p.hideEmpty === "boolean") setHideEmpty(p.hideEmpty);
    } catch {
      /* ignore malformed prefs */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ view, scope, hideEmpty } satisfies Prefs));
    } catch {
      /* storage may be unavailable (private mode) — prefs just won't persist */
    }
  }, [view, scope, hideEmpty]);

  const q = query.trim().toLowerCase();
  // "Top rated" = a workspace average of 4★ or better. Combined with the
  // text search into one predicate the board + list + counts all share.
  const matches = React.useCallback(
    (a: App) => {
      if (topRated && !(a.rating && a.rating.avg >= 4)) return false;
      if (!q) return true;
      return [a.candidate.name, a.candidate.email, a.candidate.currentRole, a.candidate.location, a.candidate.skills.join(" ")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    },
    [q, topRated],
  );

  const scopedJobs = React.useMemo(
    () => jobs.filter((j) => scope === "all" || j.mine),
    [jobs, scope],
  );

  const shownCount = React.useMemo(
    () => items.filter((a) => scopedJobs.some((j) => j.id === a.jobId) && matches(a)).length,
    [items, scopedJobs, matches],
  );

  async function moveApplication(appId: string, stageId: string) {
    const current = items.find((a) => a.id === appId);
    if (!current || current.stageId === stageId) return;
    // Snapshot both fields the optimistic update touches, so a failed move
    // restores the original "in stage" timer too — not just the stage id.
    const prevStageId = current.stageId;
    const prevEnteredAt = current.stageEnteredAt;
    setItems((arr) =>
      arr.map((a) => (a.id === appId ? { ...a, stageId, stageEnteredAt: new Date().toISOString() } : a)),
    );
    const res = await fetch(`/api/applications/${appId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId }),
    }).catch(() => null);
    if (!res?.ok) {
      setItems((arr) => arr.map((a) => (a.id === appId ? { ...a, stageId: prevStageId, stageEnteredAt: prevEnteredAt } : a)));
      return;
    }
    router.refresh();
  }

  function toggleCollapse(jobId: string) {
    setCollapsed((set) => {
      const next = new Set(set);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  const allCollapsed = scopedJobs.length > 0 && scopedJobs.every((j) => collapsed.has(j.id));
  function toggleCollapseAll() {
    setCollapsed(allCollapsed ? new Set() : new Set(scopedJobs.map((j) => j.id)));
  }

  return (
    <div className="apps-view">
      <div className="apps-toolbar">
        <h1 className="apps-title">
          Applications <span className="apps-count">{shownCount}</span>
        </h1>

        {hasMine && (
          <div className="seg" role="tablist" aria-label="Job scope">
            <button className={`seg-btn${scope === "mine" ? " active" : ""}`} onClick={() => setScope("mine")}>
              My jobs
            </button>
            <button className={`seg-btn${scope === "all" ? " active" : ""}`} onClick={() => setScope("all")}>
              All jobs
            </button>
          </div>
        )}

        <div className="spacer" />

        <div className="apps-search glass glass-faint">
          <Icons.Search size={13} style={{ color: "var(--ink-2)" }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search applicants…" />
        </div>

        <div className="seg" role="tablist" aria-label="View">
          <button
            className={`seg-btn${view === "board" ? " active" : ""}`}
            onClick={() => setView("board")}
            title="Board view"
          >
            <Icons.Pipeline size={14} />
          </button>
          <button
            className={`seg-btn${view === "list" ? " active" : ""}`}
            onClick={() => setView("list")}
            title="List view"
          >
            <Icons.Inbox size={14} />
          </button>
        </div>

        <button
          className={`btn btn-sm${topRated ? " btn-primary" : ""}`}
          onClick={() => setTopRated((v) => !v)}
          title="Show only candidates rated 4★ or higher"
        >
          <Icons.Star size={13} fill={topRated ? "currentColor" : "none"} /> Top rated
        </button>
        {view === "board" && (
          <button
            className={`btn btn-sm${hideEmpty ? " btn-primary" : ""}`}
            onClick={() => setHideEmpty((v) => !v)}
            title="Hide stages with no candidates"
          >
            Hide empty stages
          </button>
        )}
        <button className="btn btn-sm btn-ghost" onClick={toggleCollapseAll}>
          {allCollapsed ? "Expand all" : "Collapse all"}
        </button>
      </div>

      <div className="apps-scroll scroll">
        {scopedJobs.map((job) => {
          const jobApps = items.filter((a) => a.jobId === job.id && matches(a));
          // While searching, hide jobs with no matches and force-expand the rest.
          if (q && jobApps.length === 0) return null;
          const isCollapsed = !q && collapsed.has(job.id);
          return (
            <JobGroup
              key={job.id}
              job={job}
              stages={visibleStages}
              apps={jobApps}
              view={view}
              hideEmpty={hideEmpty}
              collapsed={isCollapsed}
              onToggle={() => toggleCollapse(job.id)}
              onOpen={setSelectedId}
              onMove={moveApplication}
            />
          );
        })}

        {scopedJobs.length > 0 && shownCount === 0 && (
          <div className="apps-empty muted">
            {q ? "No applicants match your search." : "No applicants in these jobs yet."}
          </div>
        )}
        {scope === "mine" && scopedJobs.length === 0 && (
          <div className="apps-empty muted">
            You&apos;re not on any job&apos;s hiring team yet.{" "}
            <button className="linklike" onClick={() => setScope("all")}>
              View all jobs
            </button>
          </div>
        )}
      </div>

      {selectedId && (
        <ProfileSheet
          applicationId={selectedId}
          stages={visibleStages}
          currentUser={currentUser}
          onClose={() => setSelectedId(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}

function JobGroup({
  job,
  stages,
  apps,
  view,
  hideEmpty,
  collapsed,
  onToggle,
  onOpen,
  onMove,
}: {
  job: Job;
  stages: Stage[];
  apps: App[];
  view: "board" | "list";
  hideEmpty: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (id: string) => void;
  onMove: (appId: string, stageId: string) => void;
}) {
  const fallback = stages[0];
  const byStage = React.useMemo(() => {
    const groups = new Map<string, App[]>();
    for (const s of stages) groups.set(s.id, []);
    for (const a of apps) {
      const sid = a.stageId && groups.has(a.stageId) ? a.stageId : fallback?.id;
      if (sid) groups.get(sid)!.push(a);
    }
    return groups;
  }, [apps, stages, fallback?.id]);

  return (
    <section className="apps-job">
      <button className="apps-job-head" onClick={onToggle} aria-expanded={!collapsed}>
        {collapsed ? <Icons.ChevronRight size={15} /> : <Icons.ChevronDown size={15} />}
        <span
          className="chip-dot"
          style={{
            background: job.status === "Draft" ? "oklch(72% 0.15 80)" : "oklch(68% 0.16 150)",
            width: 7,
            height: 7,
            borderRadius: "50%",
            display: "inline-block",
          }}
        />
        <span className="apps-job-title">{job.title}</span>
        {(job.department || job.location) && (
          <span className="apps-job-sub muted">
            {[job.department, job.location].filter(Boolean).join(" · ")}
          </span>
        )}
        {job.mine && <span className="apps-mine-tag">Mine</span>}
        <span className="spacer" />
        <span className="apps-stage-counts">
          {stages.map((s) => {
            const n = byStage.get(s.id)?.length ?? 0;
            return (
              <span key={s.id} className={`apps-stage-count${n === 0 ? " zero" : ""}`} title={s.name}>
                <span className="dot" style={{ background: s.color }} />
                {n}
              </span>
            );
          })}
        </span>
        <span className="apps-job-total">{apps.length}</span>
      </button>

      {!collapsed &&
        (view === "board" ? (
          <BoardBody stages={stages} byStage={byStage} hideEmpty={hideEmpty} onOpen={onOpen} onMove={onMove} />
        ) : (
          <ListBody stages={stages} apps={apps} onOpen={onOpen} />
        ))}
    </section>
  );
}

function BoardBody({
  stages,
  byStage,
  hideEmpty,
  onOpen,
  onMove,
}: {
  stages: Stage[];
  byStage: Map<string, App[]>;
  hideEmpty: boolean;
  onOpen: (id: string) => void;
  onMove: (appId: string, stageId: string) => void;
}) {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor),
  );

  const cols = hideEmpty ? stages.filter((s) => (byStage.get(s.id)?.length ?? 0) > 0) : stages;
  const activeApp = activeId
    ? Array.from(byStage.values()).flat().find((a) => a.id === activeId) || null
    : null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (overId) onMove(String(e.active.id), overId);
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="apps-board scroll">
        {cols.map((stage) => (
          <StageColumn key={stage.id} stage={stage} items={byStage.get(stage.id) || []} onOpen={onOpen} />
        ))}
        {cols.length === 0 && <div className="kanban-empty">No candidates in any stage</div>}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeApp ? (
          <div className="kcard pipeline-card drag-overlay-card">
            <CardInner app={activeApp} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function StageColumn({ stage, items, onOpen }: { stage: Stage; items: App[]; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div ref={setNodeRef} className={`kcol${isOver ? " drag-over" : ""}`}>
      <div className="kcol-head">
        <span
          className="chip-dot"
          style={{ background: stage.color, width: 7, height: 7, borderRadius: "50%", display: "inline-block" }}
        />
        <div className="kcol-name">{stage.name}</div>
        <span className="kcol-count">{items.length}</span>
      </div>
      <div className="kcol-list scroll">
        {items.map((app) => (
          <DraggableCard key={app.id} app={app} onOpen={() => onOpen(app.id)} />
        ))}
        {items.length === 0 && <div className="kanban-empty">—</div>}
      </div>
    </div>
  );
}

function DraggableCard({ app, onOpen }: { app: App; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: app.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ cursor: isDragging ? "grabbing" : "grab", touchAction: "none" }}
      className={`kcard pipeline-card${isDragging ? " drag-source" : ""}`}
      onClick={() => {
        if (!isDragging) onOpen();
      }}
    >
      <CardInner app={app} />
    </div>
  );
}

function CardInner({ app }: { app: App }) {
  return (
    <>
      <div className="kcard-head">
        <Avatar name={app.candidate.name} size="md" />
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
          <div className="kcard-name">{app.candidate.name}</div>
          <div className="kcard-role">{app.candidate.currentRole || app.candidate.location || " "}</div>
        </div>
        {app.unread && <span className="apps-unread-dot" title="Unread message" />}
        {typeof app.aiFit === "number" && app.aiFit >= 85 && (
          <div className="pipeline-score" title={`AI fit ${app.aiFit}`}>
            {app.aiFit}
          </div>
        )}
      </div>
      {app.rating && app.rating.count > 0 && (
        <div className="kcard-rating">
          <Stars value={app.rating.avg} size={12} showValue count={app.rating.count} />
        </div>
      )}
      <div className="kcard-meta">
        <Icons.Clock size={11} />
        <span>{relativeTime(app.stageEnteredAt)} in stage</span>
        <span className="spacer" />
        {app.outcome === "hired" && <span className="tiny apps-tag-hired">Hired</span>}
        {app.outcome === "rejected" && <span className="tiny apps-tag-rejected">Rejected</span>}
      </div>
    </>
  );
}

function ListBody({ stages, apps, onOpen }: { stages: Stage[]; apps: App[]; onOpen: (id: string) => void }) {
  const stageName = (id: string | null) => stages.find((s) => s.id === id)?.name || "—";
  return (
    <div className="apps-list">
      <div className="apps-list-head">
        <span>Candidate</span>
        <span>Stage</span>
        <span>Rating</span>
        <span>Applied</span>
        <span>In stage</span>
      </div>
      {apps.map((a) => (
        <button key={a.id} className="apps-list-row" onClick={() => onOpen(a.id)}>
          <span className="apps-list-cand">
            <Avatar name={a.candidate.name} size="sm" />
            <span style={{ minWidth: 0 }}>
              <span className="apps-list-name">{a.candidate.name}</span>
              <span className="apps-list-sub muted">{a.candidate.currentRole || a.candidate.location || ""}</span>
            </span>
            {a.unread && <span className="apps-unread-dot" title="Unread message" />}
          </span>
          <span>
            <span className="apps-stage-pill">
              <span className="dot" style={{ background: stages.find((s) => s.id === a.stageId)?.color || "var(--ink-3)" }} />
              {stageName(a.stageId)}
            </span>
          </span>
          <span>
            {a.rating && a.rating.count > 0 ? (
              <Stars value={a.rating.avg} size={12} showValue count={a.rating.count} />
            ) : (
              <span className="tiny muted">—</span>
            )}
          </span>
          <span className="muted">{relativeTime(a.appliedAt)}</span>
          <span className="muted">{relativeTime(a.stageEnteredAt)}</span>
        </button>
      ))}
    </div>
  );
}
