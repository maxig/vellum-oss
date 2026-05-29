// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import OnboardingForm from "./OnboardingForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const memberships = await db.membership.count({ where: { userId: session.user.id } });
  if (memberships > 0) redirect("/dashboard");
  return (
    <>
      <div className="ambient"><div className="blob" /></div>
      <main className="auth-shell">
        <div className="auth-card" style={{ maxWidth: 520, width: "100%" }}>
          <div className="auth-brand">
            <div className="sidebar-brand-logo">V</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 600 }}>Vellum</div>
              <div className="tiny">Set up your first workspace</div>
            </div>
          </div>
          <h1 style={{ fontSize: 26, marginBottom: 6 }}>Create a workspace</h1>
          <p className="muted" style={{ marginBottom: 22 }}>Each workspace is one company. You can switch between them later.</p>
          <OnboardingForm />
        </div>
      </main>
    </>
  );
}
