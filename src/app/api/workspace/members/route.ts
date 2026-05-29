// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Lightweight member directory used by client components that need to pick
 * a teammate from a dropdown (Schedule modal, hiring team editor, future
 * @-mention support). Returns only the fields safe to expose to admins —
 * no passwords, no preferences, no other workspaces' memberships.
 */
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const { workspace } = await requireWorkspace();
  const members = await db.membership.findMany({
    where: { workspaceId: workspace.id },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    members: members.map((m) => ({
      id: m.user.id,
      name: m.user.name || m.user.email,
      email: m.user.email,
      image: m.user.image,
      role: m.role,
    })),
  });
}
