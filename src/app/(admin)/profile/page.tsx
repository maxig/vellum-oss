// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import { requireWorkspace } from "@/lib/workspace";
import ProfileForm from "./ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { user, membership, workspace } = await requireWorkspace();
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1>Your profile</h1>
      <p className="muted" style={{ marginTop: 6, marginBottom: 28 }}>How you appear to teammates and candidates.</p>
      <ProfileForm
        user={{ id: user.id, name: user.name || "", email: user.email }}
        role={membership.role}
        workspaceName={workspace.name}
      />
    </div>
  );
}
