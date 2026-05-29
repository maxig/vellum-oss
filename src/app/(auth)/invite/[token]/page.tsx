// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import AcceptInviteForm from "./AcceptInviteForm";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await db.invite.findUnique({
    where: { token },
    include: { workspace: true, invitedBy: true },
  });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) notFound();

  const session = await auth();
  if (session?.user) {
    // If a user is already signed in with the same email, accept directly
    if (session.user.email?.toLowerCase() === invite.email.toLowerCase()) {
      const existing = await db.membership.findUnique({
        where: { userId_workspaceId: { userId: session.user.id, workspaceId: invite.workspaceId } },
      });
      if (!existing) {
        await db.membership.create({
          data: { userId: session.user.id, workspaceId: invite.workspaceId, role: invite.role },
        });
      }
      await db.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      redirect("/dashboard");
    }
  }

  return (
    <AcceptInviteForm
      token={token}
      email={invite.email}
      workspaceName={invite.workspace.name}
      invitedByName={invite.invitedBy.name || invite.invitedBy.email}
    />
  );
}
