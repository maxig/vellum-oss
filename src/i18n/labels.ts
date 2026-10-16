// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { useTranslations } from "next-intl";

// Some enum-like values are stored in the DB as English display strings
// ("Full-time", "Open", …). These map them to message keys under `common`
// so they render in the UI language; unknown values pass through as-is.
const EMPLOYMENT: Record<string, string> = {
  "Full-time": "employment.fullTime",
  "Part-time": "employment.partTime",
  Contract: "employment.contract",
  Internship: "employment.internship",
};
const JOB_STATUS: Record<string, string> = {
  Open: "jobStatus.open",
  open: "jobStatus.open",
  Published: "jobStatus.open",
  published: "jobStatus.open",
  Draft: "jobStatus.draft",
  draft: "jobStatus.draft",
  Closed: "jobStatus.closed",
  closed: "jobStatus.closed",
};
const WORK_MODE: Record<string, string> = {
  Remote: "workModes.remote",
  Hybrid: "workModes.hybrid",
  "On-site": "workModes.onsite",
};
const INTERVIEW_TITLE: Record<string, string> = {
  phone: "interviewTitles.phone",
  video: "interviewTitles.video",
  onsite: "interviewTitles.onsite",
  panel: "interviewTitles.panel",
};
const ROLE: Record<string, string> = {
  owner: "roles.owner",
  admin: "roles.admin",
  member: "roles.member",
};

export type Translate = (key: string) => string;

export function makeValueLabels(t: Translate) {
  const pick = (map: Record<string, string>) => (v: string | null | undefined) =>
    v == null ? "" : map[v] ? t(map[v]) : v;
  return {
    employment: pick(EMPLOYMENT),
    jobStatus: pick(JOB_STATUS),
    workMode: pick(WORK_MODE),
    role: pick(ROLE),
    interviewTitle: pick(INTERVIEW_TITLE),
  };
}

/** Client components and sync server components. */
export function useValueLabels() {
  const t = useTranslations("common");
  return makeValueLabels(t as unknown as Translate);
}
