// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import ThemeBoot from "@/components/ThemeBoot";

export const dynamic = "force-dynamic";

export default async function CareersLayout({
  params,
  children,
}: {
  params: Promise<{ workspace: string }>;
  children: React.ReactNode;
}) {
  const { workspace } = await params;
  const ws = await db.workspace.findUnique({ where: { slug: workspace } });
  if (!ws) notFound();

  return (
    <>
      <ThemeBoot prefs={{ theme: "light", density: "cozy", accent: "indigo", glassIntensity: 1.0 }} />
      <div className="ambient"><div className="blob" /></div>
      <div className="career-shell scroll-y">{children}</div>
    </>
  );
}
