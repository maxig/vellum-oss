// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { useLocale } from "next-intl";
import { relativeTime } from "@/lib/utils";

/** relativeTime() bound to the current UI language. */
export function useRelativeTime() {
  const locale = useLocale();
  return (d: Date | string) => relativeTime(d, locale);
}
