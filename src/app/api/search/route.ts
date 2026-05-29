// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Top-level Topbar search. Returns up to ~12 hits across the four kinds users
 * navigate to most often:
 *
 *   - jobs:       title / department / location / pitch
 *   - candidates: name / email / currentRole / location
 *   - threads:    subject (the inbox row's primary label)
 *   - settings:   static list of tabs so "billing" / "appearance" jump
 *
 * Each hit is workspace-scoped via requireWorkspace(). We only return small
 * payloads — the dropdown picks them up and renders quickly.
 */
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export type SearchHit = {
  id: string;
  kind: "job" | "candidate" | "thread" | "settings";
  title: string;
  subtitle?: string;
  href: string;
  /** Optional name used for the avatar/icon glyph fallback. */
  badge?: string;
  /**
   * For candidate hits, the most-recent application id so the Topbar can pop
   * open the shared ProfileSheet modal instead of navigating to a full page.
   */
  applicationId?: string;
};

const SETTINGS_TABS: { id: string; label: string; subtitle: string }[] = [
  { id: "workspace", label: "Workspace settings", subtitle: "Identity, currency, departments" },
  { id: "career", label: "Career site", subtitle: "Hero, about, offices, stories" },
  { id: "team", label: "Team & invites", subtitle: "Invite teammates, manage roles" },
  { id: "ai", label: "AI & integrations", subtitle: "Provider, model, privacy" },
  { id: "email", label: "Email integration", subtitle: "IMAP / SMTP / polling" },
  { id: "appearance", label: "Appearance", subtitle: "Theme, accent, density" },
  { id: "danger", label: "Danger zone", subtitle: "Export, delete workspace" },
];

export async function GET(req: Request) {
  const { workspace } = await requireWorkspace().catch(() => ({ workspace: null }));
  if (!workspace) return NextResponse.json({ hits: [] });

  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const ilike = { contains: q, mode: "insensitive" as const };

  const [jobs, candidates, threads] = await Promise.all([
    db.job.findMany({
      where: {
        workspaceId: workspace.id,
        OR: [
          { title: ilike },
          { department: ilike },
          { location: ilike },
          { pitch: ilike },
        ],
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 6,
      select: { id: true, title: true, status: true, department: true, location: true },
    }),
    db.candidate.findMany({
      where: {
        workspaceId: workspace.id,
        OR: [
          { name: ilike },
          { email: ilike },
          { currentRole: ilike },
          { location: ilike },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        name: true,
        email: true,
        currentRole: true,
        location: true,
        // Most-recent application for this candidate so the search dropdown
        // can open the ProfileSheet modal directly instead of routing to a
        // separate full-page candidate view.
        applications: {
          orderBy: { appliedAt: "desc" },
          take: 1,
          select: { id: true },
        },
      },
    }),
    db.thread.findMany({
      where: {
        workspaceId: workspace.id,
        OR: [{ subject: ilike }, { candidate: { name: ilike } }],
      },
      include: { candidate: { select: { name: true } } },
      orderBy: { lastAt: "desc" },
      take: 4,
    }),
  ]);

  const settingsHits: SearchHit[] = SETTINGS_TABS.filter((t) =>
    [t.label, t.subtitle].some((s) => s.toLowerCase().includes(q.toLowerCase())),
  ).map((t) => ({
    id: `settings-${t.id}`,
    kind: "settings",
    title: t.label,
    subtitle: t.subtitle,
    href: `/settings?tab=${t.id}`,
  }));

  const hits: SearchHit[] = [
    ...jobs.map<SearchHit>((j) => ({
      id: `job-${j.id}`,
      kind: "job",
      title: j.title,
      subtitle: [j.status, j.department, j.location].filter(Boolean).join(" · "),
      href: `/jobs/${j.id}`,
    })),
    ...candidates.map<SearchHit>((c) => ({
      id: `candidate-${c.id}`,
      kind: "candidate",
      title: c.name,
      subtitle: [c.currentRole, c.location, c.email].filter(Boolean).join(" · "),
      // Fallback href routes to the full candidate page when the modal can't
      // open (e.g. the candidate exists but has no applications yet).
      href: `/candidates/${c.id}`,
      badge: c.name,
      applicationId: c.applications[0]?.id,
    })),
    ...threads.map<SearchHit>((t) => ({
      id: `thread-${t.id}`,
      kind: "thread",
      title: t.subject || `Conversation with ${t.candidate.name}`,
      subtitle: `with ${t.candidate.name}`,
      href: `/inbox?thread=${t.id}`,
      badge: t.candidate.name,
    })),
    ...settingsHits,
  ];

  return NextResponse.json({ hits });
}
