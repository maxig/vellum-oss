// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import { requireWorkspace } from "@/lib/workspace";
import { getTranslations } from "next-intl/server";
import ProfileForm from "./ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { user, membership, workspace } = await requireWorkspace();
  const t = await getTranslations("profile.page");
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1>{t("title")}</h1>
      <p className="muted" style={{ marginTop: 6, marginBottom: 28 }}>{t("hint")}</p>
      <ProfileForm
        user={{ id: user.id, name: user.name || "", email: user.email, signature: user.signature }}
        role={membership.role}
        workspaceName={workspace.name}
      />
    </div>
  );
}
