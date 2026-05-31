// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import SheetHost from "@/components/SheetHost";
import ThemeBoot, { type Prefs } from "@/components/ThemeBoot";
import NextAuthProvider from "@/components/SessionProvider";

const DEFAULT_PREFS: Prefs = {
  theme: "light",
  density: "cozy",
  accent: "indigo",
  glassIntensity: 1.0,
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace, membership, workspaces } = await requireWorkspace();

  const [stages, unreadCount, jobs, prefsData, notifications] = await Promise.all([
    db.stage.findMany({ where: { workspaceId: workspace.id }, orderBy: { position: "asc" } }),
    db.thread.count({ where: { workspaceId: workspace.id, unread: true } }),
    db.job.findMany({ where: { workspaceId: workspace.id } }),
    db.userPreference.findUnique({ where: { userId: user.id } }),
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const prefs: Prefs = {
    theme: (prefsData?.theme as any) || DEFAULT_PREFS.theme,
    density: (prefsData?.density as any) || DEFAULT_PREFS.density,
    accent: (prefsData?.accent as any) || DEFAULT_PREFS.accent,
    glassIntensity: prefsData?.glassIntensity ?? DEFAULT_PREFS.glassIntensity,
  };

  const openJobsCount = jobs.filter((j) => j.status === "Published" || j.status === "published").length;

  const locationOptions = Array.from(
    new Set(
      jobs
        .map((j) => j.location)
        .filter(Boolean)
        .concat(["Remote", "London", "New York", "Berlin", "San Francisco"]) as string[]
    )
  );

  const departments = (workspace.departments as string[]) || [];

  return (
    <NextAuthProvider>
      <ThemeBoot prefs={prefs} />
      <div className="ambient"><div className="blob" /></div>
      <SheetHost
        stages={stages.map((s) => ({ id: s.id, key: s.key, name: s.name, color: s.color }))}
        currentUser={{
          id: user.id,
          name: user.name || user.email,
          signature: user.signature || workspace.signature || "",
        }}
        currentRole={membership.role}
        workspaceData={{
          departments,
          locations: locationOptions,
          currency: workspace.currency || "EUR",
        }}
        userProfile={{
          id: user.id,
          name: user.name || "",
          email: user.email,
          title: user.title || "",
          pronouns: user.pronouns || "",
          location: user.location || "",
          timezone: user.timezone || "",
          workingHours: user.workingHours || "",
          bio: user.bio || "",
          signature: user.signature || "",
          role: membership.role,
          joinedAt: user.createdAt.toLocaleDateString(),
          notifications: (user.preferences?.notifications as any) || {},
        }}
      >
        <div className="app">
          <Sidebar
            workspace={workspace}
            workspaces={workspaces}
            user={{ id: user.id, name: user.name, email: user.email }}
            membershipRole={membership.role}
            unread={unreadCount}
            jobsOpen={openJobsCount}
          />
          <main className="main glass">
            <Topbar
              prefs={prefs}
              notifications={notifications.map((n) => ({
                id: n.id,
                title: n.title,
                body: n.body,
                createdAt: n.createdAt.toISOString(),
                read: n.read,
              }))}
            />
            <div className="main-content scroll">{children}</div>
          </main>
        </div>
      </SheetHost>
    </NextAuthProvider>
  );
}
