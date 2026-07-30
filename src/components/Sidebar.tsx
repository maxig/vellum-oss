// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icons } from "@/components/Icons";
import { Glass, WorkspaceMark, AIPill, Avatar } from "@/components/primitives";
import { useProfileSheet } from "@/components/SheetHost";
import { useReviewQueueCount } from "@/components/useReviewQueueCount";
import { closeMobileNav } from "@/lib/mobile-nav";

type Workspace = { id: string; slug: string; name: string; domain: string; color: string };
type SidebarUser = { id: string; name: string | null; email: string };

export default function Sidebar({
  workspace,
  workspaces,
  user,
  membershipRole,
  unread,
  jobsOpen,
}: {
  workspace: Workspace;
  workspaces: Workspace[];
  user: SidebarUser;
  membershipRole: string;
  unread: number;
  jobsOpen: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { openUserProfile, openReviewQueue } = useProfileSheet();
  const { count: queueCount, loaded: queueLoaded } = useReviewQueueCount();
  const [orgOpen, setOrgOpen] = React.useState(false);
  // Tracks the workspace the user just clicked. Server props lag behind the
  // cookie change for a beat, so we keep this in client state to render the
  // selection highlight immediately. Cleared on full reload.
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const activeId = pendingId || workspace.id;

  React.useEffect(() => {
    if (!orgOpen) return;
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (!t?.closest(".sidebar-org") && !t?.closest(".org-dropdown")) setOrgOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOrgOpen(false); }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [orgOpen]);

  async function switchWorkspace(id: string) {
    if (id === workspace.id) {
      setOrgOpen(false);
      return;
    }
    // Optimistically mark the row as selected so the user sees the highlight
    // move before navigation completes. The dropdown stays open just long
    // enough for the click feedback to register, then closes on reload.
    setPendingId(id);
    setOrgOpen(false);
    const res = await fetch("/api/workspaces/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: id }),
    }).catch(() => null);
    if (!res?.ok) {
      // Switch failed — roll back the highlight and bail.
      setPendingId(null);
      return;
    }
    // Full reload so every server component (layout, page, sidebar) re-fetches
    // with the new vellum_ws cookie. `router.refresh()` is racy here — the
    // RSC fetch sometimes goes out before the cookie lands.
    window.location.assign("/dashboard");
  }

  const items = [
    { id: "dashboard",    href: "/dashboard",    icon: Icons.Home,     label: "Dashboard" },
    { id: "applications", href: "/applications", icon: Icons.Board,    label: "Applications" },
    { id: "pipeline",   href: "/pipeline",   icon: Icons.Pipeline,  label: "Pipeline",  badge: `${jobsOpen} active` },
    { id: "jobs",       href: "/jobs",       icon: Icons.Briefcase, label: "Jobs" },
    { id: "candidates", href: "/candidates", icon: Icons.Users,     label: "Candidates" },
    { id: "inbox",      href: "/inbox",      icon: Icons.Inbox,     label: "Inbox", badge: unread ? String(unread) : null },
    { id: "calendar",   href: "/calendar",   icon: Icons.Calendar,  label: "Calendar" },
    { id: "analytics",  href: "/analytics",  icon: Icons.Chart,     label: "Analytics" },
  ];
  const lower = [
    { id: "career",   href: "/career",   icon: Icons.Globe,    label: "Career site" },
    { id: "settings", href: "/settings", icon: Icons.Settings, label: "Settings" },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* Tap-outside scrim for the mobile off-canvas drawer (CSS shows it only
          under 860px when .app.nav-open). */}
      <div className="mobile-nav-scrim" onClick={closeMobileNav} aria-hidden="true" />
      <aside className="sidebar glass">
      <div className="sidebar-brand">
        <div className="sidebar-brand-logo">V</div>
        <div className="sidebar-brand-name">Vellum</div>
        <span className="chip" style={{ marginLeft: "auto", fontSize: 10, height: 18, padding: "0 6px" }}>OSS</span>
      </div>

      <div style={{ position: "relative", marginBottom: 12 }}>
        <div className="sidebar-org" onClick={() => setOrgOpen((o) => !o)} style={{ marginBottom: 0 }}>
          <WorkspaceMark workspace={workspace} />
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.15 }}>
            <div className="sidebar-org-name">{workspace.name}</div>
            <div className="sidebar-org-meta">{membershipRole} · {workspaces.length} workspace{workspaces.length === 1 ? "" : "s"}</div>
          </div>
          <Icons.ChevronDown size={13} style={{ color: "var(--ink-2)", transform: orgOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        </div>
        {orgOpen && (
          <Glass strong className="org-dropdown" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50, padding: 6, borderRadius: 12 }}>
            <div className="section-h" style={{ padding: "8px 10px 4px" }}>Switch workspace</div>
            {workspaces.map((w) => {
              const selected = w.id === activeId;
              return (
                <div
                  key={w.id}
                  onClick={() => switchWorkspace(w.id)}
                  className="row"
                  style={{
                    padding: "8px 10px", borderRadius: 8, gap: 10, cursor: "default",
                    background: selected ? "var(--accent-soft)" : "transparent",
                  }}
                  onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = "var(--glass-bg-faint)"; }}
                  onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}
                >
                  <WorkspaceMark workspace={w} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{w.name}</div>
                    <div className="tiny">{w.domain}</div>
                  </div>
                  {selected && <Icons.Check size={13} stroke={2.4} style={{ color: "var(--accent-solid)" }} />}
                </div>
              );
            })}
            <div className="divider" style={{ margin: "4px 0" }} />
            <Link
              href="/onboarding/new-workspace"
              onClick={() => setOrgOpen(false)}
              className="row"
              style={{ padding: "8px 10px", borderRadius: 8, gap: 10, cursor: "default", textDecoration: "none", color: "inherit" }}
            >
              <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--glass-bg-faint)", border: "0.5px dashed var(--line-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icons.Plus size={12} style={{ color: "var(--ink-2)" }} />
              </div>
              <div style={{ flex: 1, fontSize: 12.5, color: "var(--ink-1)" }}>Create workspace</div>
            </Link>
          </Glass>
        )}
      </div>

      {items.map((it) => (
        <Link key={it.id} href={it.href} onClick={closeMobileNav} className={`nav-item ${isActive(it.href) ? "active" : ""}`}>
          <it.icon size={15} className="nav-icon" />
          <span>{it.label}</span>
          {it.badge && <span className="nav-badge">{it.badge}</span>}
        </Link>
      ))}

      <div style={{ height: 12 }} />
      <div className="section-h" style={{ padding: "6px 10px" }}>Company</div>
      {lower.map((it) => (
        <Link key={it.id} href={it.href} onClick={closeMobileNav} className={`nav-item ${isActive(it.href) ? "active" : ""}`}>
          <it.icon size={15} className="nav-icon" />
          <span>{it.label}</span>
        </Link>
      ))}

      <div style={{ flex: 1 }} />

      {/* AI assistant CTA — opens the Review queue sheet. The whole card is
          clickable; the inner button is the visible affordance. We use a
          button (not a Link) so the click handler reliably triggers the
          sheet without racing Next's router. */}
      <button
        type="button"
        onClick={() => openReviewQueue()}
        className="glass-faint"
        style={{
          borderRadius: 12,
          padding: 12,
          marginTop: 8,
          border: "0.5px solid var(--line)",
          background: "var(--glass-bg-faint)",
          color: "inherit",
          textAlign: "left",
          cursor: "default",
          width: "100%",
          font: "inherit",
        }}
      >
        <div className="row" style={{ gap: 8, marginBottom: 6 }}>
          <AIPill>AI assistant</AIPill>
        </div>
        <div className="tiny" style={{ color: "var(--ink-1)", lineHeight: 1.4 }}>
          {/* Mirrors the topbar badge — reads from the cached review queue
              count so the copy reflects the same triage list the user
              sees when they click through. Falls back to a neutral
              loading state to avoid flashing "0" before the fetch lands. */}
          {!queueLoaded ? (
            <>Scanning your pipeline…</>
          ) : queueCount === 0 ? (
            <>You're all caught up — nothing needs you right now.</>
          ) : (
            <>
              <b>{queueCount}</b> candidate{queueCount === 1 ? "" : "s"} need
              {queueCount === 1 ? "s" : ""} attention.
            </>
          )}
        </div>
        <div style={{ marginTop: 10 }}>
          <span
            className="btn btn-sm"
            style={{ width: "100%", display: "inline-flex", justifyContent: "center", pointerEvents: "none" }}
          >
            Review queue
          </span>
        </div>
      </button>

      <button
        type="button"
        onClick={openUserProfile}
        className="row"
        style={{
          marginTop: 10,
          padding: "6px 4px",
          gap: 10,
          borderRadius: 9,
          background: "transparent",
          border: 0,
          color: "inherit",
          cursor: "default",
          width: "100%",
          textAlign: "left",
          font: "inherit",
        }}
      >
        <Avatar name={user.name || user.email} size="sm" />
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.15 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500 }}>{user.name || user.email.split("@")[0]}</div>
          <div className="tiny">{membershipRole}</div>
        </div>
        <Icons.MoreH size={14} style={{ color: "var(--ink-2)" }} />
      </button>
      </aside>
    </>
  );
}
