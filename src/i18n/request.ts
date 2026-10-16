// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_LOCALE, isLocale, matchAcceptLanguage, type Locale } from "./config";
import { loadMessages } from "../../messages/load";

/**
 * UI language for the current request, most specific first:
 *   0. on the public career site: that workspace's language
 *   1. the signed-in user's own choice (UserPreference.locale)
 *   2. their current workspace's default (Workspace.locale)
 *   3. the browser's Accept-Language
 *   4. English
 */
export async function resolveLocale(): Promise<Locale> {
  // Public career site: candidates get the workspace's language, whoever is
  // viewing (a recruiter previewing it included). Set by src/middleware.ts.
  const careerSlug = (await headers()).get("x-vellum-career-site");
  if (careerSlug) {
    const ws = await db.workspace.findUnique({ where: { slug: careerSlug }, select: { locale: true } });
    if (isLocale(ws?.locale)) return ws.locale;
  }

  const session = await auth().catch(() => null);
  const userId = session?.user?.id;
  if (userId) {
    const pref = await db.userPreference.findUnique({
      where: { userId },
      select: { locale: true, lastWorkspace: true },
    });
    if (isLocale(pref?.locale)) return pref.locale;

    // Same cookie requireWorkspace() reads; lastWorkspace covers a missing cookie.
    const workspaceId = (await cookies()).get("vellum_ws")?.value || pref?.lastWorkspace;
    if (workspaceId) {
      const membership = await db.membership.findFirst({
        where: { userId, workspaceId },
        select: { workspace: { select: { locale: true } } },
      });
      if (isLocale(membership?.workspace.locale)) return membership.workspace.locale;
    }
  }
  return matchAcceptLanguage((await headers()).get("accept-language")) ?? DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return { locale, messages: await loadMessages(locale) };
});
