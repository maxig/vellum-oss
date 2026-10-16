// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { getMessages } from "next-intl/server";
import type { Messages } from "../../messages/load";

/**
 * The namespaces a NextIntlClientProvider should ship to the browser. The
 * root layout sends only what public pages need; the admin and career-site
 * layouts add their own, so candidates don't download the admin UI's strings.
 */
export async function pickMessages<K extends keyof Messages>(namespaces: K[]): Promise<Pick<Messages, K>> {
  const all = (await getMessages()) as Messages;
  return Object.fromEntries(namespaces.map((ns) => [ns, all[ns]])) as Pick<Messages, K>;
}
