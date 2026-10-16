// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { getTranslations } from "next-intl/server";
import { makeValueLabels, type Translate } from "./labels";

/** useValueLabels() for async server components. */
export async function getValueLabels() {
  const t = await getTranslations("common");
  return makeValueLabels(t as unknown as Translate);
}
