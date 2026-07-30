// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";

/**
 * Dashboard "My to-dos" widget — the open to-dos assigned to me, with a
 * quick-add and inline done-toggle. Candidate-linked items open the drawer.
 */

import * as React from "react";
import { Glass, Icons } from "@/components/primitives";
import { TodoRow, type Todo } from "@/components/TodoButton";
import { useProfileSheet } from "@/components/SheetHost";

export default function DashboardTodos() {
  const { openSheet } = useProfileSheet();
  const [todos, setTodos] = React.useState<Todo[] | null>(null);
  const [me, setMe] = React.useState("");
  const [title, setTitle] = React.useState("");
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

  const mineOpen = (todos || []).filter((t) => t.assigneeId === me && !t.done);

  async function toggle(t: Todo) {
    setTodos((cur) => (cur ? cur.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) : cur));
    const res = await fetch(`/api/todos/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !t.done }),
    }).catch(() => null);
    if (!res?.ok) setTodos((cur) => (cur ? cur.map((x) => (x.id === t.id ? { ...x, done: t.done } : x)) : cur));
  }
  async function remove(t: Todo) {
    setTodos((cur) => (cur ? cur.filter((x) => x.id !== t.id) : cur));
    const res = await fetch(`/api/todos/${t.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) setTodos((cur) => (cur && !cur.some((x) => x.id === t.id) ? [t, ...cur] : cur));
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      const json = await res.json().catch(() => null);
      if (json?.todo) setTodos((cur) => [json.todo, ...(cur || [])]);
      setTitle("");
    }
  }

  return (
    <Glass className="card" style={{ padding: 22 }}>
      <div className="row" style={{ marginBottom: 14, alignItems: "baseline" }}>
        <h2 style={{ fontSize: 16, flex: 1 }}>My to-dos</h2>
        {mineOpen.length > 0 && (
          <span className="chip" style={{ height: 20, fontSize: 11 }}>{mineOpen.length} open</span>
        )}
      </div>

      {todos === null ? (
        <div className="col" style={{ gap: 6 }}>
          <div className="ai-shimmer" style={{ height: 34, borderRadius: 8 }} />
          <div className="ai-shimmer" style={{ height: 34, borderRadius: 8 }} />
        </div>
      ) : mineOpen.length === 0 ? (
        <p className="muted" style={{ fontSize: 13, margin: "4px 0 12px" }}>You&apos;re all caught up — nothing on your list.</p>
      ) : (
        <div className="col" style={{ gap: 2, marginBottom: 8 }}>
          {mineOpen.slice(0, 6).map((t) => (
            <TodoRow
              key={t.id}
              t={t}
              me={me}
              onToggle={() => toggle(t)}
              onRemove={() => remove(t)}
              onOpen={() => t.applicationId && openSheet(t.applicationId)}
            />
          ))}
          {mineOpen.length > 6 && <div className="tiny muted" style={{ padding: "2px 8px" }}>+{mineOpen.length - 6} more</div>}
        </div>
      )}

      <form onSubmit={add} className="row" style={{ gap: 6, marginTop: 4 }}>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a to-do…"
          style={{ flex: 1, height: 32, fontSize: 12.5 }}
        />
        <button type="submit" className="btn btn-sm btn-primary" disabled={!title.trim() || busy} style={{ height: 32 }}>
          <Icons.Plus size={12} /> Add
        </button>
      </form>
    </Glass>
  );
}
