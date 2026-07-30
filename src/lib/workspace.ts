// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isAppHost } from "@/lib/app-host";

const COOKIE = "vellum_ws";

export async function currentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: {
      preferences: true,
      memberships: { include: { workspace: true } },
    },
  });
  return user;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function currentWorkspaceId(): Promise<string | null> {
  const c = await cookies();
  const v = c.get(COOKIE)?.value;
  return v || null;
}

export async function setCurrentWorkspaceCookie(workspaceId: string) {
  const c = await cookies();
  c.set(COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
}

export async function requireWorkspace() {
  const user = await requireUser();
  if (!user.memberships.length) redirect("/onboarding");

  const wanted = await currentWorkspaceId();
  const membership =
    user.memberships.find((m) => m.workspaceId === wanted) ?? user.memberships[0];

  if (!membership) redirect("/onboarding");

  // Also keep UserPreference.lastWorkspace in sync (best-effort)
  if (user.preferences?.lastWorkspace !== membership.workspaceId) {
    await db.userPreference
      .upsert({
        where: { userId: user.id },
        create: { userId: user.id, lastWorkspace: membership.workspaceId },
        update: { lastWorkspace: membership.workspaceId },
      })
      .catch(() => null);
  }

  return {
    user,
    membership,
    workspace: membership.workspace,
    workspaces: user.memberships.map((m) => m.workspace),
  };
}

/**
 * Role hierarchy: owner > admin > member.
 *
 * - owner: workspace creator. Manages other owners and can delete the
 *   workspace. Everything an admin can do.
 * - admin: manages settings (AI / career site / email), invites and
 *   removes teammates (except owners), deletes jobs / candidates /
 *   applications.
 * - member: day-to-day recruiting work — create/edit jobs, move
 *   candidates through the pipeline, schedule interviews, write notes,
 *   send messages. Cannot publish or delete jobs, cannot change roles,
 *   cannot touch workspace settings.
 */
export type Role = "owner" | "admin" | "member";

export function isOwner(role: string): boolean {
  return role === "owner";
}

export function isAdmin(role: string): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Resolve a workspace from the public host (subdomain).
 * If host is "<slug>.localhost:3000" → returns the matching workspace, else null.
 */
export async function workspaceFromHost(): Promise<{ slug: string; workspaceId: string } | null> {
  const h = await headers();
  const host = h.get("host") || "";
  const apex = process.env.PUBLIC_DOMAIN || "localhost:3000";
  // Drop port for comparison
  const apexBare = apex.split(":")[0];
  const hostBare = host.split(":")[0];
  if (hostBare === apexBare || hostBare === "127.0.0.1") return null;
  // The admin app may be served from a subdomain of the same apex; never
  // resolve that host to a workspace career site.
  if (isAppHost(hostBare)) return null;
  if (!hostBare.endsWith("." + apexBare)) return null;
  const slug = hostBare.slice(0, hostBare.length - ("." + apexBare).length);
  if (!slug) return null;
  const ws = await db.workspace.findUnique({ where: { slug } });
  if (!ws) return null;
  return { slug, workspaceId: ws.id };
}
