// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import OnboardingForm from "../OnboardingForm";

export const dynamic = "force-dynamic";

export default async function NewWorkspacePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const t = await getTranslations("auth.onboarding");
  return (
    <>
      <div className="ambient"><div className="blob" /></div>
      <main className="auth-shell">
        <div className="auth-card" style={{ maxWidth: 520, width: "100%" }}>
          <h1 style={{ fontSize: 26, marginBottom: 6 }}>{t("newTitle")}</h1>
          <p className="muted" style={{ marginBottom: 22 }}>{t("newHint")}</p>
          <OnboardingForm redirectAfter="/dashboard" />
        </div>
      </main>
    </>
  );
}
