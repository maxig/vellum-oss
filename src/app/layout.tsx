// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import "./globals.css";
import * as React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vellum — AI-first ATS",
  description: "Open-source, AI-first applicant tracking. Self-hosted.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" data-density="cozy">
      <body>{children}</body>
    </html>
  );
}
