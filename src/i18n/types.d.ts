// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import type { Messages } from "../../messages/load";
import type { Locale } from "./config";

// Typed keys: a t("…") call with a key missing from en.json fails tsc.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
