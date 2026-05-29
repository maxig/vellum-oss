// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";

/**
 * Shared review-queue counter hook.
 *
 * Used by both the topbar button (badge) and the sidebar AI-assistant
 * CTA (copy "You have N candidates needing attention."). Each consumer
 * fetches independently — that's two API hits per mount, but the API
 * is cache-backed (single indexed read) and the in-process build guard
 * means duplicate fetches never trigger duplicate AI calls.
 *
 * Refreshes on window focus so a user coming back from another tab
 * sees an up-to-date number without waiting for the hourly worker tick.
 */

import * as React from "react";

type Payload = {
  items?: { urgent?: boolean }[];
};

export type ReviewQueueCount = {
  count: number;
  hasUrgent: boolean;
  loaded: boolean;
};

export function useReviewQueueCount(): ReviewQueueCount {
  const [count, setCount] = React.useState(0);
  const [hasUrgent, setHasUrgent] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const r = await fetch("/api/review-queue", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as Payload;
      const items = j.items || [];
      setCount(items.length);
      setHasUrgent(items.some((it) => it.urgent));
    } catch {
      // Silent — last known value stays on screen.
    } finally {
      setLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    load();
    function onFocus() {
      load();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  return { count, hasUrgent, loaded };
}
