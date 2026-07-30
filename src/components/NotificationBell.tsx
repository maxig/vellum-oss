// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";

/**
 * Topbar notifications panel. Seeds from the SSR list for instant paint,
 * then fetches the richer payload (resolved applicationId + fresh read
 * state) on mount and whenever the panel opens. Clicking an item marks it
 * read and navigates — candidates open the shared ProfileSheet, jobs route.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/Icons";
import { useProfileSheet } from "@/components/SheetHost";
import { relativeTime } from "@/lib/utils";

type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  icon: string;
  read: boolean;
  candidateId: string | null;
  jobId: string | null;
  applicationId: string | null;
  createdAt: string;
};

type SeedNotification = { id: string; title: string; body: string; createdAt: string; read: boolean };

export default function NotificationBell({ initial }: { initial: SeedNotification[] }) {
  const router = useRouter();
  const { openSheet } = useProfileSheet();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Notification[]>(() =>
    initial.map((n) => ({
      id: n.id,
      kind: "system",
      title: n.title,
      body: n.body,
      icon: "Bell",
      read: n.read,
      candidateId: null,
      jobId: null,
      applicationId: null,
      createdAt: n.createdAt,
    })),
  );

  const load = React.useCallback(async () => {
    const res = await fetch("/api/notifications", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const json = await res.json().catch(() => null);
    if (json?.notifications) setItems(json.notifications);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Refresh when the panel opens so newly-arrived notifications show up.
  React.useEffect(() => {
    if (open) load();
  }, [open, load]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const unread = items.filter((n) => !n.read).length;

  async function markAllRead() {
    if (unread === 0) return;
    setItems((cur) => cur.map((n) => ({ ...n, read: true })));
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => null);
  }

  async function onItem(n: Notification) {
    if (!n.read) {
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id }),
      }).catch(() => null);
    }
    setOpen(false);
    if (n.applicationId) openSheet(n.applicationId);
    else if (n.jobId) router.push(`/jobs/${n.jobId}`);
  }

  return (
    <div style={{ position: "relative" }}>
      <button className="iconbtn" onClick={() => setOpen((o) => !o)} title="Notifications" aria-label={`Notifications — ${unread} unread`} aria-haspopup="true" aria-expanded={open}>
        <Icons.Bell size={15} />
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--accent-solid)",
              border: "1.5px solid var(--bg-0)",
            }}
          />
        )}
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 80 }} onClick={() => setOpen(false)} />
          <div
            className="glass glass-strong"
            style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 380, padding: 6, borderRadius: 14, zIndex: 90, maxHeight: 480, overflow: "auto" }}
          >
            <div className="row" style={{ padding: "8px 10px 6px", alignItems: "center" }}>
              <div className="section-h" style={{ flex: 1, padding: 0 }}>Notifications</div>
              {unread > 0 && (
                <button className="btn btn-sm btn-ghost" style={{ height: 24, fontSize: 11 }} onClick={markAllRead}>
                  <Icons.Check size={11} /> Mark all read
                </button>
              )}
            </div>
            {items.length === 0 && <div style={{ padding: "16px 12px" }} className="tiny">No notifications yet.</div>}
            {items.map((n) => {
              const Ic = (Icons as Record<string, React.FC<{ size?: number }>>)[n.icon] || Icons.Bell;
              const clickable = !!(n.applicationId || n.jobId);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onItem(n)}
                  disabled={!clickable && n.read}
                  className="notif-item"
                  style={{
                    display: "flex",
                    gap: 10,
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: 0,
                    background: n.read ? "transparent" : "var(--accent-soft)",
                    color: "inherit",
                    font: "inherit",
                    cursor: clickable ? "pointer" : "default",
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      flexShrink: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "var(--glass-bg)",
                      border: "0.5px solid var(--line)",
                      color: n.read ? "var(--ink-2)" : "var(--accent-solid)",
                    }}
                  >
                    <Ic size={13} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 550 }}>{n.title}</div>
                    {n.body && <div className="tiny" style={{ marginTop: 2 }}>{n.body}</div>}
                    <div className="tiny" style={{ marginTop: 4, color: "var(--ink-3)" }}>{relativeTime(n.createdAt)}</div>
                  </div>
                  {!n.read && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent-solid)", flexShrink: 0, marginTop: 4 }} />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
