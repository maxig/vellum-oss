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
  type DragEndEvent,
  type DragStartEvent,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { Chip, Avatar } from "@/components/primitives";
import { Icons } from "@/components/Icons";
import ProfileSheet from "@/components/ProfileSheet";
import { relativeTime } from "@/lib/utils";

type Stage = { id: string; key: string; name: string; color: string };
type JobSummary = {
  id: string;
  title: string;
  status: string;
  department: string;
  location: string;
  applicants: number;
};
type Applicant = {
  id: string;
  jobId: string;
  stageId: string | null;
  aiFit: number | null;
  aiSummary: string | null;
  resumeUrl: string | null;
  resumeName: string | null;
  whyUs: string | null;
  screeningAnswers: Record<string, unknown>;
  appliedAt: string;
  updatedAt: string;
  candidate: {
    id: string;
    name: string;
    email: string | null;
    currentRole: string;
    location: string;
    linkedin: string | null;
    portfolio: string | null;
    github: string | null;
    years: number | null;
    source: string;
    skills: string[];
    createdAt: string;
  };
  interviews: { id: string; scheduledAt: string; kind: string; durationMin: number }[];
  notes: { id: string; body: string; author: string; createdAt: string }[];
  threadId: string | null;
};

const PIPELINE_KEYS = ["applied", "screen", "interview", "offer", "hired"];

export default function KanbanBoard({
  activeJobId,
  currentUser,
  jobs,
  stages,
  applications,
}: {
  activeJobId: string;
  currentUser: { name: string };
  jobs: JobSummary[];
  stages: Stage[];
  applications: Applicant[];
}) {
  const router = useRouter();
  const visibleStages = React.useMemo(
    () =>
      stages
        .filter((s) => PIPELINE_KEYS.includes(s.key))
        .sort((a, b) => PIPELINE_KEYS.indexOf(a.key) - PIPELINE_KEYS.indexOf(b.key)),
    [stages],
  );
  const fallbackStage = visibleStages[0];
  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];

  const [items, setItems] = React.useState<Applicant[]>(applications);
  const [filter, setFilter] = React.useState("");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  // Captured at drag start so the overlay card matches the source card's
  // measured size exactly, instead of relying on `width: 100%` (which can
  // misalign when columns are flexed and the overlay wrapper inherits its
  // size from a slightly different rect than the source card).
  const [activeRect, setActiveRect] = React.useState<{ width: number; height: number } | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [mockNotice, setMockNotice] = React.useState<string | null>(null);
  const noticeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setItems(applications);
    setSelectedId((id) => (id && applications.some((app) => app.id === id) ? id : null));
  }, [applications]);

  React.useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  const sensors = useSensors(
    // A smaller activation distance reduces the visible jump between the
    // initial click point and where the drag overlay first appears.
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor),
  );

  const filteredItems = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((app) => {
      const haystack = [
        app.candidate.name,
        app.candidate.email,
        app.candidate.currentRole,
        app.candidate.location,
        app.candidate.source,
        app.candidate.skills.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [filter, items]);

  const byStage = React.useMemo(() => {
    const groups = new Map<string, Applicant[]>();
    for (const stage of visibleStages) groups.set(stage.id, []);
    for (const app of filteredItems) {
      const stageId = app.stageId && groups.has(app.stageId) ? app.stageId : fallbackStage?.id;
      if (stageId) groups.get(stageId)!.push(app);
    }
    return groups;
  }, [fallbackStage?.id, filteredItems, visibleStages]);

  const totalApplicants = applications.length;
  const lateStageCount = applications.filter((app) => {
    const stage = visibleStages.find((s) => s.id === app.stageId);
    return stage?.key === "interview" || stage?.key === "offer";
  }).length;
  const averageFit = average(applications.map((app) => app.aiFit).filter((score): score is number => typeof score === "number"));

  function changeJob(jobId: string) {
    if (jobId === activeJobId) return;
    router.push(`/pipeline?job=${encodeURIComponent(jobId)}`);
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    // Capture the source card's exact rect so the overlay can mirror it.
    const node = document.querySelector<HTMLElement>(`[data-app-id="${String(e.active.id)}"]`);
    if (node) {
      const r = node.getBoundingClientRect();
      setActiveRect({ width: r.width, height: r.height });
    }
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    setActiveRect(null);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;

    const targetStage = visibleStages.find((s) => s.id === overId || `stage:${s.id}` === overId);
    if (targetStage) await moveApplication(String(e.active.id), targetStage.id);
  }

  function onDragCancel() {
    setActiveId(null);
    setActiveRect(null);
  }

  async function moveApplication(appId: string, stageId: string) {
    const current = items.find((app) => app.id === appId);
    if (!current || current.stageId === stageId) return;

    const previousStageId = current.stageId;
    setItems((arr) => arr.map((app) => (app.id === appId ? { ...app, stageId } : app)));

    const response = await fetch(`/api/applications/${appId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId }),
    }).catch(() => null);

    if (!response?.ok) {
      setItems((arr) => arr.map((app) => (app.id === appId ? { ...app, stageId: previousStageId } : app)));
      return;
    }

    router.refresh();
  }

  function mockAction(label: string) {
    setMockNotice(`${label} is mocked for now`);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setMockNotice(null), 2200);
  }

  const activeApp = activeId ? items.find((app) => app.id === activeId) || null : null;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
      <div className="pipeline-view">
        <div className="pipeline-toolbar">
          <div className="pipeline-job-picker glass glass-faint">
            <Icons.Briefcase size={14} style={{ color: "var(--ink-2)" }} />
            <select className="pipeline-job-select" value={activeJobId} onChange={(e) => changeJob(e.target.value)} aria-label="Select job posting">
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title} ({job.applicants})
                </option>
              ))}
            </select>
            <Icons.ChevronDown size={12} style={{ color: "var(--ink-2)" }} />
          </div>

          <div className="pipeline-statbar">
            <Chip>{totalApplicants} applicants</Chip>
            <Chip dot={activeJob?.status === "Draft" ? "oklch(72% 0.15 80)" : "oklch(68% 0.16 150)"}>
              {activeJob?.status || "Open"}
            </Chip>
            <Chip>{lateStageCount} late stage</Chip>
            {averageFit ? <Chip accent>{averageFit} avg fit</Chip> : null}
          </div>

          <div className="spacer" />

          <div className="pipeline-search glass glass-faint">
            <Icons.Filter size={13} style={{ color: "var(--ink-2)" }} />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name, skills, location..."
            />
          </div>

          <div className="pipeline-actions">
            <button className="btn btn-sm btn-ghost" onClick={() => mockAction("AI screen")}>
              <Icons.Sparkle size={13} stroke={2} />
              AI screen
            </button>
            <button className="btn btn-sm" onClick={() => mockAction("Add candidate")}>
              <Icons.Plus size={13} stroke={2} />
              Add candidate
            </button>
          </div>
        </div>

        <div className="kanban scroll" style={{ overflowX: "auto", overflowY: "hidden" }}>
          {visibleStages.map((stage) => (
            <Column
              key={stage.id}
              stage={stage}
              items={byStage.get(stage.id) || []}
              isFiltered={Boolean(filter.trim())}
              onOpen={(id) => setSelectedId(id)}
              onAdd={() => mockAction(`Add to ${stage.name}`)}
            />
          ))}
        </div>
      </div>

      {selectedId && (
        <ProfileSheet
          applicationId={selectedId}
          stages={visibleStages.map((s) => ({ id: s.id, key: s.key, name: s.name, color: s.color }))}
          currentUser={{ id: "current", name: currentUser.name }}
          onClose={() => setSelectedId(null)}
          onChanged={() => router.refresh()}
        />
      )}

      {mockNotice && (
        <div className="toast">
          <Icons.Check size={14} style={{ color: "var(--accent-solid)" }} />
          {mockNotice}
        </div>
      )}

      {/* Render the drag preview in a portal at <body> so it floats above the
          column scroll containers (the previous in-flow transform was hidden
          behind sibling columns while dragging across them). Width/height are
          inlined from the measured source rect so the overlay matches the
          source card exactly — relying on `width: 100%` against the dnd-kit
          wrapper produced a subtle horizontal drift when the column's flex
          sizing didn't match what dnd-kit had pre-measured. */}
      <DragOverlay dropAnimation={null}>
        {activeApp ? (
          <div
            className="kcard pipeline-card drag-overlay-card"
            style={activeRect ? { width: activeRect.width, height: activeRect.height } : undefined}
          >
            <Card app={activeApp} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  stage,
  items,
  isFiltered,
  onOpen,
  onAdd,
}: {
  stage: Stage;
  items: Applicant[];
  isFiltered: boolean;
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div ref={setNodeRef} className={`kcol${isOver ? " drag-over" : ""}`}>
      <div className="kcol-head">
        <span className="chip-dot" style={{ background: stage.color, width: 7, height: 7, borderRadius: "50%", display: "inline-block" }} />
        <div className="kcol-name">{stage.name}</div>
        <span className="kcol-count">{items.length}</span>
        <div className="spacer" />
        <button className="iconbtn" style={{ width: 24, height: 24 }} onClick={onAdd} aria-label={`Add candidate to ${stage.name}`}>
          <Icons.Plus size={13} />
        </button>
      </div>
      <div className="kcol-list scroll">
        {items.map((app) => (
          <DraggableCard key={app.id} app={app} onOpen={() => onOpen(app.id)} />
        ))}
        {items.length === 0 && (
          <div className="kanban-empty">
            {isFiltered ? "No matching applicants" : "Drag candidates here"}
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ app, onOpen }: { app: Applicant; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: app.id });
  // The DragOverlay (rendered at the DndContext root, portalled to <body>)
  // owns the floating preview. Here we just reserve the source card's slot
  // without painting a second card behind the preview.
  const style: React.CSSProperties = {
    cursor: isDragging ? "grabbing" : "grab",
    touchAction: "none",
  };
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      data-app-id={app.id}
      className={`kcard pipeline-card${isDragging ? " drag-source" : ""}`}
      onClick={() => {
        if (!isDragging) onOpen();
      }}
    >
      <Card app={app} />
    </div>
  );
}

function Card({ app }: { app: Applicant }) {
  return (
    <>
      <div className="kcard-head">
        <Avatar name={app.candidate.name} size="md" />
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
          <div className="kcard-name">{app.candidate.name}</div>
          <div className="kcard-role">{app.candidate.location || "\u00a0"}</div>
        </div>
        {typeof app.aiFit === "number" && app.aiFit >= 85 && (
          <div className="pipeline-score" title={`AI fit ${app.aiFit}`}>
            {app.aiFit}
          </div>
        )}
      </div>
      {!!app.candidate.skills.length && (
        <div className="row" style={{ flexWrap: "wrap", gap: 4, marginTop: 10 }}>
          {app.candidate.skills.slice(0, 2).map((skill) => (
            <span key={skill} className="chip" style={{ height: 20, fontSize: 10.5 }}>{skill}</span>
          ))}
        </div>
      )}
      <div className="kcard-meta">
        <Icons.Clock size={11} />
        <span>{relativeTime(app.appliedAt)}</span>
        <span className="spacer" />
        <span className="tiny">{app.candidate.source || "Direct"}</span>
      </div>
    </>
  );
}

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}
