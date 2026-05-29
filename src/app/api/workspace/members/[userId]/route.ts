// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Single-membership endpoint: view a teammate's workspace profile, change
 * their role, or remove them from the workspace.
 *
 * Removing a membership tears the user out of THIS workspace only — their
 * User row stays (they may belong to other workspaces or accept a
 * re-invite later). Workspace-scoped resources they authored (notes,
 * activity, reviewer assignments) keep their user reference; only the
 * workspace seat is removed.
 *
 * Owner/admin only for mutating endpoints. Owners can't be downgraded or
 * removed by an admin — only by another owner — and the workspace must
 * always have at least one owner.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const Patch = z.object({
  role: z.enum(["owner", "admin", "member"]),
});

async function loadMembership(workspaceId: string, userId: string) {
  return db.membership.findFirst({
    where: { workspaceId, userId },
    include: {
      user: {
        select: {
          id: true, name: true, email: true, image: true,
          title: true, pronouns: true, location: true,
          timezone: true, workingHours: true, bio: true,
          createdAt: true,
        },
      },
    },
  });
}

function isAdminOrOwner(role: string) {
  return role === "owner" || role === "admin";
}

export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { workspace } = await requireWorkspace();
  const { userId } = await params;
  const m = await loadMembership(workspace.id, userId);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
    image: m.user.image,
    title: m.user.title,
    pronouns: m.user.pronouns,
    location: m.user.location,
    timezone: m.user.timezone,
    workingHours: m.user.workingHours,
    bio: m.user.bio,
    role: m.role,
    joinedAt: m.createdAt.toISOString(),
    userCreatedAt: m.user.createdAt.toISOString(),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { workspace, membership } = await requireWorkspace();
  const { userId } = await params;
  if (!isAdminOrOwner(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = Patch.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const target = await loadMembership(workspace.id, userId);
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Only an owner can promote to owner or change another owner's role.
  if ((target.role === "owner" || body.data.role === "owner") && membership.role !== "owner") {
    return NextResponse.json({ error: "owner_required" }, { status: 403 });
  }

  // Don't strand the workspace ownerless.
  if (target.role === "owner" && body.data.role !== "owner") {
    const owners = await db.membership.count({ where: { workspaceId: workspace.id, role: "owner" } });
    if (owners <= 1) {
      return NextResponse.json({ error: "last_owner" }, { status: 409 });
    }
  }

  await db.membership.update({
    where: { id: target.id },
    data: { role: body.data.role },
  });

  return NextResponse.json({ ok: true, role: body.data.role });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { workspace, membership, user } = await requireWorkspace();
  const { userId } = await params;
  if (!isAdminOrOwner(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const target = await loadMembership(workspace.id, userId);
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Owners can only be removed by another owner.
  if (target.role === "owner" && membership.role !== "owner") {
    return NextResponse.json({ error: "owner_required" }, { status: 403 });
  }

  // Don't strand the workspace ownerless. Removing yourself is the
  // existing "leave workspace" flow — same guard applies.
  if (target.role === "owner") {
    const owners = await db.membership.count({ where: { workspaceId: workspace.id, role: "owner" } });
    if (owners <= 1) {
      return NextResponse.json({ error: "last_owner" }, { status: 409 });
    }
  }

  await db.membership.delete({ where: { id: target.id } });

  await db.activity.create({
    data: {
      workspaceId: workspace.id,
      actorId: user.id,
      actorName: user.name || user.email,
      kind: "member_removed",
      icon: "X",
      body: `Removed ${target.user.name || target.user.email} from the workspace.`,
    },
  }).catch(() => null);

  return NextResponse.json({ ok: true });
}
