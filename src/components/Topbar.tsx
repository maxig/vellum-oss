// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icons } from "@/components/Icons";
import { Avatar } from "@/components/primitives";
import { applyPrefs, type Prefs } from "@/components/ThemeBoot";
import { useProfileSheet } from "@/components/SheetHost";
import ReviewQueueButton from "@/components/ReviewQueueButton";
import TodoButton from "@/components/TodoButton";
import NotificationBell from "@/components/NotificationBell";
import { toggleMobileNav } from "@/lib/mobile-nav";

const titles: Record<string, { title: string; crumb?: string }> = {
  "/dashboard":  { title: "Dashboard",   crumb: "Your workspace" },
  "/applications": { title: "Applications", crumb: "All jobs" },
  "/pipeline":   { title: "Pipeline",    crumb: "Jobs › Pipeline" },
  "/jobs":       { title: "Jobs",        crumb: "All postings" },
  "/candidates": { title: "Candidates",  crumb: "Database" },
  "/inbox":      { title: "Inbox",       crumb: "Conversations" },
  "/analytics":  { title: "Analytics",   crumb: "Career site" },
  "/career":     { title: "Career site", crumb: "Preview" },
  "/settings":   { title: "Settings" },
  "/profile":    { title: "Profile" },
};

type SearchHit = {
  id: string;
  kind: "job" | "candidate" | "thread" | "settings";
  title: string;
  subtitle?: string;
  href: string;
  badge?: string;
  applicationId?: string;
};

export default function Topbar({
  prefs,
  notifications,
  right,
}: {
  prefs: Prefs;
  notifications: { id: string; title: string; body: string; createdAt: string; read: boolean }[];
  right?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { openSheet } = useProfileSheet();
  const match = Object.keys(titles).find((p) => pathname === p || pathname.startsWith(p + "/")) || "/dashboard";
  const meta = titles[match];

  const [theme, setTheme] = React.useState(prefs.theme);

  // ── Search state ────────────────────────────────────────────────────────
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchBusy, setSearchBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = React.useRef<AbortController | null>(null);

  async function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyPrefs({ ...prefs, theme: next });
    await fetch("/api/preferences", { method: "POST", body: JSON.stringify({ theme: next }) });
  }

  // Debounced search — abort any in-flight call so we always render the most
  // recent query's results rather than racing.
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearchBusy(false);
      return;
    }
    setSearchBusy(true);
    debounceRef.current = setTimeout(async () => {
      inflightRef.current?.abort();
      const ctrl = new AbortController();
      inflightRef.current = ctrl;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) {
          setHits([]);
          return;
        }
        const json = (await res.json()) as { hits: SearchHit[] };
        setHits(json.hits || []);
        setActiveIdx(0);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setHits([]);
      } finally {
        setSearchBusy(false);
      }
    }, 140);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // ⌘K / Ctrl+K focuses the search input from anywhere.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(hit: SearchHit) {
    setSearchOpen(false);
    setQuery("");
    setHits([]);
    // Candidates open the shared ProfileSheet modal instead of routing to a
    // separate page. This matches the "Open profile" affordance in the inbox
    // and pipeline, so there's only one place to maintain the candidate view.
    if (hit.kind === "candidate" && hit.applicationId) {
      openSheet(hit.applicationId);
      return;
    }
    router.push(hit.href);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!searchOpen || hits.length === 0) {
      if (e.key === "Escape") {
        setSearchOpen(false);
        inputRef.current?.blur();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(hits.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[activeIdx];
      if (hit) go(hit);
    } else if (e.key === "Escape") {
      setSearchOpen(false);
      inputRef.current?.blur();
    }
  }

  // Visually group hits by kind so users scan faster.
  const grouped = React.useMemo(() => {
    const groups: { kind: SearchHit["kind"]; label: string; items: SearchHit[] }[] = [
      { kind: "job", label: "Jobs", items: [] },
      { kind: "candidate", label: "Candidates", items: [] },
      { kind: "thread", label: "Conversations", items: [] },
      { kind: "settings", label: "Settings", items: [] },
    ];
    for (const h of hits) {
      const g = groups.find((g) => g.kind === h.kind);
      if (g) g.items.push(h);
    }
    return groups.filter((g) => g.items.length > 0);
  }, [hits]);

  // Track a flat-index so arrow navigation crosses group boundaries cleanly.
  let flatIdx = -1;

  return (
    <div className="topbar">
      <button
        className="iconbtn topbar-hamburger"
        onClick={toggleMobileNav}
        aria-label="Open navigation menu"
        title="Menu"
        style={{ marginRight: 4 }}
      >
        <Icons.Menu size={17} />
      </button>
      <div className="topbar-head">
        {meta.crumb && <div className="topbar-crumb">{meta.crumb}</div>}
        <div className="topbar-title">{meta.title}</div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ position: "relative" }}>
        <div className="search">
          <Icons.Search size={14} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search candidates, jobs, conversations…"
          />
          <span className="tiny mono" style={{ background: "var(--glass-bg)", padding: "1px 6px", borderRadius: 5, border: "0.5px solid var(--line)" }}>⌘K</span>
        </div>

        {searchOpen && query.trim().length >= 2 && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 80 }}
              onClick={() => setSearchOpen(false)}
            />
            <div
              className="glass glass-strong"
              role="listbox"
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                width: 440,
                padding: 6,
                borderRadius: 14,
                zIndex: 90,
                maxHeight: 480,
                overflowY: "auto",
              }}
            >
              {searchBusy && hits.length === 0 && (
                <div className="tiny" style={{ padding: "12px 14px", color: "var(--ink-2)" }}>
                  Searching…
                </div>
              )}
              {!searchBusy && hits.length === 0 && (
                <div className="tiny" style={{ padding: "12px 14px", color: "var(--ink-2)" }}>
                  No matches for "{query.trim()}".
                </div>
              )}
              {grouped.map((g) => (
                <div key={g.kind} style={{ marginBottom: 4 }}>
                  <div
                    className="section-h"
                    style={{ padding: "8px 12px 4px", fontSize: 10.5, letterSpacing: "0.06em" }}
                  >
                    {g.label}
                  </div>
                  {g.items.map((h) => {
                    flatIdx++;
                    const isActive = flatIdx === activeIdx;
                    const myIdx = flatIdx;
                    return (
                      <button
                        key={h.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActiveIdx(myIdx)}
                        onClick={() => go(h)}
                        className="search-hit"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: 10,
                          border: 0,
                          background: isActive ? "var(--glass-bg-strong)" : "transparent",
                          color: "inherit",
                          textAlign: "left",
                          cursor: "default",
                          font: "inherit",
                        }}
                      >
                        {h.kind === "candidate" || h.kind === "thread" ? (
                          <Avatar name={h.badge || h.title} size="sm" />
                        ) : (
                          <span
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 7,
                              background: "var(--accent-soft)",
                              color: "var(--accent-solid)",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {h.kind === "job" ? (
                              <Icons.Briefcase size={13} />
                            ) : (
                              <Icons.Settings size={13} />
                            )}
                          </span>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13.5,
                              fontWeight: 500,
                              color: "var(--ink-0)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {h.title}
                          </div>
                          {h.subtitle && (
                            <div
                              className="tiny"
                              style={{
                                marginTop: 1,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {h.subtitle}
                            </div>
                          )}
                        </div>
                        {isActive && (
                          <span className="tiny mono" style={{ color: "var(--ink-2)" }}>
                            ↵
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {right}
      <ReviewQueueButton />
      <button className="iconbtn" onClick={toggleTheme} title="Toggle theme">
        {theme === "dark" ? <Icons.Sun size={15} /> : <Icons.Moon size={15} />}
      </button>
      <TodoButton />
      <NotificationBell initial={notifications} />
    </div>
  );
}
