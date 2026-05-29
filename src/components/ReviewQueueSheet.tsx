// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";

/**
 * ReviewQueueSheet — modal sheet that lists the current user's cached
 * triage items, grouped by bucket. Mirrors the prototype at
 * vellum-design/project/view-review-queue.jsx as closely as the design
 * system allows.
 *
 * Loading model:
 *   - On open, fetch /api/review-queue.
 *   - The server returns whatever's cached + a `stale` flag.
 *   - If stale, the server has already kicked off a background rebuild;
 *     we don't poll, we just show "Refreshing…" so the user knows.
 *   - The "Refresh" button calls /api/review-queue/refresh (rate-limited
 *     server-side to 1/min) and replaces state on success.
 *
 * Action model:
 *   - All inline actions optimistically remove the row, then call
 *     POST /api/review-queue/items/[candidateId]/done so the server's
 *     cache row matches. We don't await the route navigation; the user
 *     sees the row disappear instantly.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/Icons";
import { Avatar } from "@/components/primitives";
import { useProfileSheet } from "@/components/SheetHost";
import { BUCKETS, type BucketId, type BucketAction } from "@/lib/review-queue";

type QueueItem = {
  candidateId: string;
  applicationId: string;
  bucketId: BucketId;
  reason: string;
  urgent: boolean;
  severity: number;
  action: BucketAction;
  rank: number;
  candidate: {
    id: string;
    name: string;
    stage: string;
    stageName: string;
    stageColor: string;
    avatarSeed: string;
  };
};

type QueueResponse = {
  items: QueueItem[];
  builtAt: string;
  stale: boolean;
  aiState: "ok" | "disabled" | "error" | "empty";
  scope?: "mine" | "workspace";
  /** Server-enforced: members can never see "workspace" scope. We use
   * this to hide the toggle, not just disable it — see ROLES.md. */
  canSeeWorkspace?: boolean;
  coldStart?: boolean;
};

export default function ReviewQueueSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { openSheet } = useProfileSheet();

  const [data, setData] = React.useState<QueueResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<"all" | BucketId>("all");
  const [refreshing, setRefreshing] = React.useState(false);
  const [refreshError, setRefreshError] = React.useState<string | null>(null);

  // Initial fetch + escape-to-close.
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/review-queue", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j: QueueResponse) => {
        if (!cancelled) setData(j);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load your queue. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function applyFilter(next: "all" | BucketId) {
    if (filter === next) return;
    setFilter(next);
    // Fire-and-forget telemetry — no body shape contract beyond §12.
    fetch("/api/review-queue/telemetry/filter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucketId: next }),
    }).catch(() => {});
  }

  async function changeScope(next: "mine" | "workspace") {
    // Cache is workspace-wide; scope is just a server-side filter applied
    // to the cached items. So a scope change is fast: persist the
    // preference, refetch (the response will be a single filter
    // operation on the existing cache row), no rebuild involved.
    setData((prev) => (prev ? { ...prev, scope: next } : prev));
    setRefreshError(null);
    try {
      await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewScope: next }),
      });
      const r = await fetch("/api/review-queue", { cache: "no-store" });
      if (r.ok) setData(await r.json());
    } catch {
      // best-effort; the old scope state stays if the request bombs
    }
  }

  async function manualRefresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const r = await fetch("/api/review-queue/refresh", { method: "POST" });
      if (r.status === 429) {
        const j = await r.json().catch(() => ({}));
        setRefreshError(
          j.retryAfter
            ? `Wait ${j.retryAfter}s before refreshing again.`
            : "Refresh in progress — try again shortly.",
        );
        return;
      }
      if (!r.ok) {
        setRefreshError("Refresh failed.");
        return;
      }
      const j = (await r.json()) as QueueResponse;
      setData(j);
    } finally {
      setRefreshing(false);
    }
  }

  async function clearItem(item: QueueItem) {
    // Optimistic — update local state immediately, then sync the cache.
    setData((prev) => (prev ? { ...prev, items: prev.items.filter((it) => it.candidateId !== item.candidateId) } : prev));
    try {
      await fetch(`/api/review-queue/items/${encodeURIComponent(item.candidateId)}/done`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Tells the server which bucket/action the clear came from, so
        // telemetry can answer "which buckets convert" without us
        // needing a second mutation endpoint per action.
        body: JSON.stringify({ bucketId: item.bucketId, action: item.action, wasAI: item.bucketId === "ai" }),
      });
    } catch {
      // If the sync fails the next worker tick will reconcile; we don't
      // bounce the row back into the UI.
    }
  }

  function handleAction(item: QueueItem) {
    // Bucket-typed primary action. Each one routes somewhere useful and
    // clears the item from the queue. Per §11 of the spec we never act
    // on the candidate without the user clicking — these are navigations.
    if (item.action === "message") {
      router.push(`/inbox?candidate=${item.candidateId}`);
    } else if (item.action === "schedule") {
      // No schedule sheet in Phase 1 — open the profile and let the user
      // use the existing schedule affordance there.
      openSheet(item.applicationId);
    } else if (item.action === "decide") {
      openSheet(item.applicationId);
    } else if (item.action === "nudge") {
      router.push(`/inbox?candidate=${item.candidateId}&template=nudge`);
    } else if (item.action === "complete") {
      openSheet(item.applicationId);
    }
    clearItem(item);
    onClose();
  }

  function openProfile(item: QueueItem) {
    openSheet(item.applicationId);
    onClose();
  }

  const items = data?.items || [];
  const visible = filter === "all" ? items : items.filter((it) => it.bucketId === filter);
  const total = items.length;
  const visibleTotal = visible.length;
  const builtAgo = data ? relativeMinutes(data.builtAt) : "";

  // Group visible items by bucket, preserving §4 priority order.
  const grouped = BUCKETS.map((def) => ({
    def,
    items: visible.filter((it) => it.bucketId === def.id),
  })).filter((g) => g.items.length > 0);

  // The chip strip only shows buckets that have at least one item.
  const presentBuckets = BUCKETS.filter((def) => items.some((it) => it.bucketId === def.id));

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div
        className="sheet glass glass-strong"
        style={{ width: "min(820px, calc(100vw - 48px))", height: "min(720px, calc(100vh - 48px))" }}
        role="dialog"
        aria-label="Review queue"
      >
        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: "0.5px solid var(--line)" }}>
          <div className="row" style={{ gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                boxShadow: "0 4px 12px -3px color-mix(in oklab, var(--accent-2) 40%, transparent)",
              }}
            >
              <Icons.Sparkle size={18} stroke={2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="topbar-crumb">AI assistant</div>
              <div className="topbar-title">Review queue</div>
            </div>
            <button className="iconbtn" onClick={onClose} aria-label="Close">
              <Icons.X size={15} />
            </button>
          </div>

          <p className="muted" style={{ fontSize: 13.5, marginTop: 12 }}>
            {!data && !error && "Loading your queue…"}
            {error && error}
            {data &&
              (total === 0 ? (
                "Inbox zero. Nothing's blocked on you right now — nice work."
              ) : (
                <>
                  I scanned your pipeline and found{" "}
                  <b style={{ color: "var(--ink-0)" }}>
                    {total} candidate{total !== 1 ? "s" : ""}
                  </b>{" "}
                  who need attention. Sorted by what's most time-sensitive.
                </>
              ))}
          </p>

          {/* Scope picker — per-user override of the workspace default.
              Hidden for members entirely (per ROLES.md, workspace scope
              is owner/admin-only). Hidden until the first response
              lands so we don't render an ambiguous "mine vs workspace"
              before we know which one. */}
          {data?.scope && data.canSeeWorkspace && (
            <div className="row" style={{ marginTop: 12, gap: 8, alignItems: "center" }}>
              <span className="tiny" style={{ color: "var(--ink-2)" }}>Showing</span>
              <div className="row" style={{ gap: 0 }}>
                {(["mine", "workspace"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className="btn btn-sm"
                    onClick={() => data.scope !== opt && changeScope(opt)}
                    disabled={refreshing}
                    style={{
                      height: 26,
                      padding: "0 10px",
                      fontSize: 12,
                      borderRadius: opt === "mine" ? "8px 0 0 8px" : "0 8px 8px 0",
                      background: data.scope === opt ? "var(--glass-bg-strong)" : "transparent",
                      borderColor: data.scope === opt ? "var(--glass-border)" : "var(--line)",
                      color: data.scope === opt ? "var(--ink-0)" : "var(--ink-2)",
                    }}
                  >
                    {opt === "mine" ? "My candidates" : "Whole workspace"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Filter chips */}
          {data && total > 0 && (
            <div className="row" style={{ marginTop: 14, gap: 6, flexWrap: "wrap" }}>
              <BucketChip on={filter === "all"} count={total} onClick={() => applyFilter("all")}>
                All
              </BucketChip>
              {presentBuckets.map((b) => (
                <BucketChip
                  key={b.id}
                  on={filter === b.id}
                  count={items.filter((it) => it.bucketId === b.id).length}
                  onClick={() => applyFilter(b.id)}
                  color={b.color}
                  icon={b.icon}
                >
                  {b.shortLabel}
                </BucketChip>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="scroll" style={{ flex: 1, overflowY: "auto" }}>
          {data && visibleTotal === 0 && total > 0 && (
            <BlankState>Nothing in this bucket needs you.</BlankState>
          )}
          {data && total === 0 && <InboxZero />}
          {grouped.map((g) => (
            <section key={g.def.id}>
              <div
                className="row"
                style={{
                  padding: "14px 24px 6px",
                  position: "sticky",
                  top: 0,
                  zIndex: 2,
                  background: "var(--glass-bg-strong)",
                  backdropFilter: "blur(14px)",
                  WebkitBackdropFilter: "blur(14px)",
                  borderBottom: "0.5px solid var(--line)",
                }}
              >
                <BucketIcon name={g.def.icon} color={g.def.color} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-0)", flex: 1, marginLeft: 8 }}>
                  {g.def.label}
                </span>
                <span className="chip" style={{ height: 20, fontSize: 11 }}>
                  {g.items.length}
                </span>
              </div>
              {g.items.map((item) => (
                <QueueRow
                  key={`${item.bucketId}:${item.candidateId}`}
                  item={item}
                  onAction={() => handleAction(item)}
                  onOpen={() => openProfile(item)}
                />
              ))}
            </section>
          ))}
        </div>

        {/* Footer */}
        {data && (
          <div
            className="row"
            style={{ padding: "12px 22px", borderTop: "0.5px solid var(--line)", gap: 8 }}
          >
            <Icons.Sparkle size={12} style={{ color: "var(--accent-solid)" }} />
            <span className="tiny" style={{ flex: 1 }}>
              {refreshing
                ? "Refreshing…"
                : data.stale
                  ? `Queue cached ${builtAgo}. Refreshing in background.`
                  : `Queue cached ${builtAgo}. Refreshes every hour.`}
              {refreshError && <span style={{ color: "oklch(50% 0.18 28)", marginLeft: 8 }}>{refreshError}</span>}
            </span>
            <button className="btn btn-sm btn-ghost" onClick={manualRefresh} disabled={refreshing}>
              <Icons.Refresh size={11} /> Refresh
            </button>
            <a className="btn btn-sm btn-ghost" href="/settings?tab=ai#review-queue">
              Customize rules
            </a>
            <button className="btn btn-sm btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────

function QueueRow({
  item,
  onAction,
  onOpen,
}: {
  item: QueueItem;
  onAction: () => void;
  onOpen: () => void;
}) {
  // AI items get the design-system AI affordance per spec §3:
  // a tinted left border + a Sparkle pill next to the candidate name.
  const isAI = item.bucketId === "ai";
  return (
    <div
      className="row"
      style={{
        padding: "14px 24px",
        borderBottom: "0.5px solid var(--line)",
        borderLeft: isAI ? "2px solid var(--accent-solid)" : "2px solid transparent",
        background: isAI ? "color-mix(in oklab, var(--accent-solid) 4%, transparent)" : "transparent",
        gap: 14,
        cursor: "default",
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = isAI
          ? "color-mix(in oklab, var(--accent-solid) 8%, transparent)"
          : "var(--glass-bg-faint)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = isAI
          ? "color-mix(in oklab, var(--accent-solid) 4%, transparent)"
          : "transparent")
      }
    >
      <Avatar name={item.candidate.avatarSeed || item.candidate.name} size="md" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-0)" }}>
            {item.candidate.name}
          </span>
          {isAI && (
            <span
              className="chip"
              style={{
                background: "var(--accent-soft)",
                color: "var(--accent-solid)",
                borderColor: "transparent",
                gap: 4,
              }}
              title="Surfaced by the AI overlay"
            >
              <Icons.Sparkle size={10} stroke={2.4} />
              AI
            </span>
          )}
          <span
            className="chip"
            style={{
              background: `color-mix(in oklab, ${item.candidate.stageColor} 18%, transparent)`,
              borderColor: "transparent",
            }}
          >
            <span className="chip-dot" style={{ background: item.candidate.stageColor }} />
            {item.candidate.stageName}
          </span>
          {item.urgent && (
            <span
              className="chip"
              style={{
                background: "color-mix(in oklab, oklch(60% 0.18 28) 16%, transparent)",
                color: "oklch(50% 0.18 28)",
                borderColor: "transparent",
              }}
            >
              Urgent
            </span>
          )}
        </div>
        <div className="tiny" style={{ marginTop: 3, lineHeight: 1.45, color: "var(--ink-1)" }}>
          {item.reason}
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <ActionButton item={item} onClick={onAction} />
        <button className="btn btn-sm btn-ghost" onClick={onOpen}>
          Open
        </button>
      </div>
    </div>
  );
}

function ActionButton({ item, onClick }: { item: QueueItem; onClick: () => void }) {
  if (item.action === "message") {
    return (
      <button className="btn btn-sm btn-primary" onClick={onClick}>
        <Icons.Mail size={11} /> Reply
      </button>
    );
  }
  if (item.action === "schedule") {
    return (
      <button className="btn btn-sm btn-primary" onClick={onClick}>
        <Icons.Calendar size={11} /> Schedule
      </button>
    );
  }
  if (item.action === "decide") {
    return (
      <button className="btn btn-sm btn-primary" onClick={onClick}>
        Decide
      </button>
    );
  }
  if (item.action === "nudge") {
    return (
      <button className="btn btn-sm btn-primary" onClick={onClick}>
        <Icons.Send size={11} /> Nudge
      </button>
    );
  }
  return (
    <button className="btn btn-sm" onClick={onClick}>
      <Icons.Check size={11} /> Complete
    </button>
  );
}

function BucketChip({
  on,
  count,
  color,
  icon,
  onClick,
  children,
}: {
  on: boolean;
  count: number;
  color?: string;
  icon?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="btn btn-sm btn-ghost"
      style={{
        height: 26,
        padding: "0 10px",
        fontSize: 12,
        gap: 6,
        background: on ? "var(--glass-bg-strong)" : "transparent",
        border: on ? "0.5px solid var(--glass-border)" : "0.5px solid var(--line)",
        color: on ? "var(--ink-0)" : "var(--ink-2)",
      }}
    >
      {icon && <BucketIcon name={icon} size={11} color={color} />}
      <span>{children}</span>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          padding: "1px 6px",
          borderRadius: 999,
          background: on ? "var(--accent-soft)" : "var(--glass-bg-faint)",
          color: on ? "var(--accent-solid)" : "var(--ink-2)",
        }}
      >
        {count}
      </span>
    </button>
  );
}

function BucketIcon({ name, color, size = 13 }: { name: string; color?: string; size?: number }) {
  // The Icons object is keyed by string but typed as a record; narrow at
  // the call site so a misnamed icon falls back to Clock rather than
  // crashing the sheet.
  const I = (Icons as unknown as Record<string, React.FC<{ size?: number; style?: React.CSSProperties }>>)[name] || Icons.Clock;
  return <I size={size} style={{ color: color || "var(--ink-2)" }} />;
}

function BlankState({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 60, textAlign: "center", color: "var(--ink-2)" }}>
      <Icons.Check size={36} stroke={1.5} style={{ color: "oklch(70% 0.14 150)", marginBottom: 12 }} />
      <div style={{ fontSize: 15, fontWeight: 500, color: "var(--ink-0)", marginBottom: 4 }}>
        All clear here.
      </div>
      <div className="tiny">{children}</div>
    </div>
  );
}

function InboxZero() {
  return (
    <div style={{ padding: 80, textAlign: "center", color: "var(--ink-2)" }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))",
          margin: "0 auto 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
        }}
      >
        <Icons.Check size={28} stroke={2} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 500, color: "var(--ink-0)", marginBottom: 6 }}>
        Inbox zero.
      </div>
      <div style={{ fontSize: 13.5 }}>Nothing's blocked on you right now — nice work.</div>
    </div>
  );
}

function relativeMinutes(iso: string): string {
  const diffSec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return `${Math.floor(diffSec / 3600)}h ago`;
}
