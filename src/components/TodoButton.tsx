// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";

/**
 * Topbar to-dos popover. Self-contained: fetches /api/todos, shows a badge
 * of open to-dos assigned to me, and a My / Assigned tabbed list with inline
 * add + done-toggle. Candidate-linked to-dos open the shared ProfileSheet.
 */

import * as React from "react";
import { Icons } from "@/components/Icons";
import { useProfileSheet } from "@/components/SheetHost";

export type Todo = {
  id: string;
  title: string;
  done: boolean;
  dueAt: string | null;
  doneAt: string | null;
  creatorId: string;
  creatorName: string;
  assigneeId: string;
  assigneeName: string;
  candidateId: string | null;
  candidateName: string | null;
  applicationId: string | null;
  jobTitle: string | null;
  createdAt: string;
};

type Member = { id: string; name: string; email: string };

export default function TodoButton() {
  const { openSheet } = useProfileSheet();
  const [open, setOpen] = React.useState(false);
  const [todos, setTodos] = React.useState<Todo[]>([]);
  const [me, setMe] = React.useState<string>("");
  const [tab, setTab] = React.useState<"mine" | "assigned">("mine");
  const [members, setMembers] = React.useState<Member[]>([]);
  const [title, setTitle] = React.useState("");
  const [assignee, setAssignee] = React.useState("");
  const [due, setDue] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/todos", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const json = await res.json().catch(() => null);
    if (json?.todos) {
      setTodos(json.todos);
      setMe(json.me);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Refresh on open — the button lives in the layout, so its data can go
  // stale as to-dos are created elsewhere (dashboard widget, drawer).
  React.useEffect(() => {
    if (!open) return;
    load();
    if (!members.length) {
      fetch("/api/workspace/members", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j?.members && setMembers(j.members))
        .catch(() => {});
    }
  }, [open, members.length, load]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const mine = todos.filter((t) => t.assigneeId === me);
  const assigned = todos.filter((t) => t.creatorId === me && t.assigneeId !== me);
  const openCount = mine.filter((t) => !t.done).length;
  const list = tab === "mine" ? mine : assigned;

  async function toggle(t: Todo) {
    setTodos((cur) => cur.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    const res = await fetch(`/api/todos/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !t.done }),
    }).catch(() => null);
    if (!res?.ok) setTodos((cur) => cur.map((x) => (x.id === t.id ? { ...x, done: t.done } : x)));
  }

  async function remove(t: Todo) {
    setTodos((cur) => cur.filter((x) => x.id !== t.id));
    const res = await fetch(`/api/todos/${t.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) setTodos((cur) => (cur.some((x) => x.id === t.id) ? cur : [t, ...cur]));
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        assigneeId: assignee || null,
        dueAt: due ? new Date(due + "T09:00:00").toISOString() : null,
      }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      const json = await res.json().catch(() => null);
      if (json?.todo) setTodos((cur) => [json.todo, ...cur]);
      setTitle("");
      setDue("");
      setAssignee("");
      // If assigned to someone else, jump to the Assigned tab to show it.
      if (json?.todo && json.todo.assigneeId !== me) setTab("assigned");
    }
  }

  function openCandidate(t: Todo) {
    if (t.applicationId) {
      setOpen(false);
      openSheet(t.applicationId);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button className="iconbtn" onClick={() => setOpen((o) => !o)} title="To-dos" aria-label={`To-dos — ${openCount} open`} aria-haspopup="true" aria-expanded={open}>
        <Icons.ListChecks size={15} />
        {openCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: 1,
              right: 0,
              minWidth: 15,
              height: 15,
              padding: "0 4px",
              borderRadius: 999,
              background: "var(--accent-solid)",
              color: "white",
              fontSize: 9.5,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1.5px solid var(--bg-0)",
            }}
          >
            {openCount > 9 ? "9+" : openCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 80 }} onClick={() => setOpen(false)} />
          <div
            className="glass glass-strong"
            style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 380, padding: 8, borderRadius: 14, zIndex: 90, maxHeight: 520, overflow: "auto" }}
          >
            <div className="seg" role="tablist" aria-label="To-do scope" style={{ marginBottom: 8 }}>
              <button className={`seg-btn${tab === "mine" ? " active" : ""}`} onClick={() => setTab("mine")}>
                My to-dos{openCount ? ` (${openCount})` : ""}
              </button>
              <button className={`seg-btn${tab === "assigned" ? " active" : ""}`} onClick={() => setTab("assigned")}>
                Assigned
              </button>
            </div>

            <div className="col" style={{ gap: 4 }}>
              {list.length === 0 && (
                <div className="tiny" style={{ padding: "12px 8px", color: "var(--ink-2)" }}>
                  {tab === "mine" ? "Nothing on your list. Add a to-do below." : "You haven't assigned any to-dos."}
                </div>
              )}
              {list.map((t) => (
                <TodoRow key={t.id} t={t} me={me} onToggle={() => toggle(t)} onRemove={() => remove(t)} onOpen={() => openCandidate(t)} />
              ))}
            </div>

            <form onSubmit={add} style={{ marginTop: 8, borderTop: "0.5px solid var(--line)", paddingTop: 8 }}>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Add a to-do…"
                style={{ height: 32, fontSize: 12.5 }}
              />
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                <select className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)} style={{ flex: 1, height: 30, fontSize: 12 }} aria-label="Assign to">
                  <option value="">Assign to me</option>
                  {members.filter((m) => m.id !== me).map((m) => (
                    <option key={m.id} value={m.id}>{m.name || m.email}</option>
                  ))}
                </select>
                <input
                  type="date"
                  className="input"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  style={{ width: 130, height: 30, fontSize: 12 }}
                  aria-label="Due date"
                />
                <button type="submit" className="btn btn-sm btn-primary" disabled={!title.trim() || busy} style={{ height: 30 }}>
                  <Icons.Plus size={12} />
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

export function TodoRow({
  t,
  me,
  onToggle,
  onRemove,
  onOpen,
  hideCandidate,
}: {
  t: Todo;
  me: string;
  onToggle: () => void;
  onRemove: () => void;
  onOpen?: () => void;
  hideCandidate?: boolean;
}) {
  const overdue = !t.done && t.dueAt && new Date(t.dueAt).getTime() < Date.now();
  const dueLabel = t.dueAt ? new Date(t.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
  return (
    <div className="row" style={{ gap: 8, padding: "7px 8px", borderRadius: 8, alignItems: "flex-start" }}>
      <button
        className="iconbtn"
        onClick={onToggle}
        aria-label={t.done ? "Mark not done" : "Mark done"}
        title={t.done ? "Mark not done" : "Mark done"}
        style={{ width: 22, height: 22, color: t.done ? "var(--accent-solid)" : "var(--ink-3)", flexShrink: 0, marginTop: 1 }}
      >
        {t.done ? <Icons.CheckCircle size={16} /> : <Icons.Circle size={16} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, lineHeight: 1.35, color: t.done ? "var(--ink-3)" : "var(--ink-0)", textDecoration: t.done ? "line-through" : "none" }}>
          {t.title}
        </div>
        <div className="row" style={{ gap: 6, marginTop: 3, flexWrap: "wrap" }}>
          {!hideCandidate && t.candidateName && (
            <button
              className="tiny"
              onClick={onOpen}
              disabled={!t.applicationId}
              style={{ background: "none", border: 0, padding: 0, color: t.applicationId ? "var(--accent-solid)" : "var(--ink-2)", cursor: t.applicationId ? "pointer" : "default", font: "inherit" }}
            >
              {t.candidateName}
            </button>
          )}
          {dueLabel && (
            <span className="tiny" style={{ color: overdue ? "oklch(60% 0.18 28)" : "var(--ink-3)" }}>
              <Icons.Clock size={10} /> {dueLabel}
            </span>
          )}
          {t.assigneeId !== me && <span className="tiny" style={{ color: "var(--ink-3)" }}>→ {t.assigneeName}</span>}
          {t.assigneeId === me && t.creatorId !== me && <span className="tiny" style={{ color: "var(--ink-3)" }}>from {t.creatorName}</span>}
        </div>
      </div>
      <button className="iconbtn" onClick={onRemove} aria-label="Delete to-do" title="Delete" style={{ width: 22, height: 22, color: "var(--ink-3)", flexShrink: 0 }}>
        <Icons.X size={12} />
      </button>
    </div>
  );
}
