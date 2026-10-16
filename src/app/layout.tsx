// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import "./globals.css";
import * as React from "react";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { pickMessages } from "@/i18n/pick";

export const metadata: Metadata = {
  title: "Vellum — AI-first ATS",
  description: "Open-source, AI-first applicant tracking. Self-hosted.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  // Public pages (login, onboarding, landing) only need these; see src/i18n/pick.ts.
  const messages = await pickMessages(["common", "auth", "consent"]);
  return (
    <html lang={locale} data-theme="light" data-density="cozy">
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
