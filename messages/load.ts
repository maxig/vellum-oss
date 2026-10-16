// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// One JSON file per namespace and language. To add a namespace, create
// messages/en/<ns>.json (+ other languages) and register it in `en` below.
// English is the source of truth: it types every t("…") key, and any key
// missing from another language falls back to it.
import type { Locale } from "@/i18n/config";
import analytics from "./en/analytics.json";
import auth from "./en/auth.json";
import calendar from "./en/calendar.json";
import candidates from "./en/candidates.json";
import careers from "./en/careers.json";
import common from "./en/common.json";
import consent from "./en/consent.json";
import dashboard from "./en/dashboard.json";
import inbox from "./en/inbox.json";
import jobs from "./en/jobs.json";
import landing from "./en/landing.json";
import nav from "./en/nav.json";
import pipeline from "./en/pipeline.json";
import profile from "./en/profile.json";
import settings from "./en/settings.json";
import todos from "./en/todos.json";

export const en = { analytics, auth, calendar, candidates, careers, common, consent, dashboard, inbox, jobs, landing, nav, pipeline, profile, settings, todos };
export type Messages = typeof en;

export async function loadMessages(locale: Locale): Promise<Messages> {
  if (locale === "en") return en;
  const entries = await Promise.all(
    Object.keys(en).map(async (ns) => {
      const translated = await import(`./${locale}/${ns}.json`).then((m) => m.default).catch(() => ({}));
      return [ns, deepMerge((en as any)[ns], translated)] as const;
    })
  );
  return Object.fromEntries(entries) as Messages;
}

function deepMerge(base: any, over: any): any {
  const out: any = { ...base };
  for (const [k, v] of Object.entries(over ?? {})) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge(base?.[k], v) : v;
  }
  return out;
}
