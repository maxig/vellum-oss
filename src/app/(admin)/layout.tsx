// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import NextAuthProvider from "@/components/SessionProvider";
import ThemeBoot, { type Prefs } from "@/components/ThemeBoot";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import SheetHost from "@/components/SheetHost";
import { relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireWorkspace().catch((e) => {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e;
    return null;
  });
  if (!ctx) redirect("/login");

  const { user, workspace, workspaces, membership } = ctx;

  const [openJobsCount, unreadCount, notifications, stages] = await Promise.all([
    db.job.count({ where: { workspaceId: workspace.id, status: "Open" } }),
    db.thread.count({ where: { workspaceId: workspace.id, unread: true } }),
    db.notification.findMany({
      where: { workspaceId: workspace.id, userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    db.stage.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { position: "asc" },
    }),
  ]);

  const prefs: Prefs = {
    theme: (user.preferences?.theme as Prefs["theme"]) || "light",
    density: (user.preferences?.density as Prefs["density"]) || "cozy",
    accent: (user.preferences?.accent as Prefs["accent"]) || "indigo",
    glassIntensity: user.preferences?.glassIntensity ?? 1.0,
  };

  return (
    <NextAuthProvider>
      <ThemeBoot prefs={prefs} />
      <div className="ambient"><div className="blob" /></div>
      <SheetHost
        stages={stages.map((s) => ({ id: s.id, key: s.key, name: s.name, color: s.color }))}
        currentUser={{ id: user.id, name: user.name || user.email }}
        currentRole={membership.role}
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
          signature: user.signature || workspace.signature || "",
          role: membership.role,
          joinedAt: user.createdAt.toLocaleDateString(undefined, {
            month: "short",
            year: "numeric",
          }),
          notifications:
            user.preferences && user.preferences.notifications
              ? (user.preferences.notifications as Record<string, boolean>) as any
              : {},
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
                createdAt: relativeTime(n.createdAt),
                read: n.read,
              }))}
            />
            <div className="viewport">{children}</div>
          </main>
        </div>
      </SheetHost>
    </NextAuthProvider>
  );
}
