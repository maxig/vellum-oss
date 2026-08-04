// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { logger } from "@/lib/log";

const log = logger("instrumentation");

/**
 * Next.js instrumentation hook — runs once when the server boots.
 *
 * Only do work in the Node.js runtime; the edge runtime can't reach Prisma
 * or the IMAP socket. We log explicitly so the operator can confirm the
 * background workers actually came up.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  log.info(`register · runtime=${process.env.NEXT_RUNTIME}`);
  const { startEmailWorker } = await import("@/lib/email-worker");
  startEmailWorker();

  // Recap worker — refreshes the dashboard recap cache in the background
  // and dispatches daily / weekly / monthly digest emails. The dashboard
  // reads from this cache so a page load never blocks on the LLM.
  const { startRecapWorker } = await import("@/lib/recap-worker");
  startRecapWorker();

  // Review queue worker — hourly rebuild of per-user action-item queues.
  // The Review queue sheet reads from ReviewQueueCache so opening it is
  // a single indexed read regardless of pipeline size.
  const { startReviewQueueWorker } = await import("@/lib/review-queue-worker");
  startReviewQueueWorker();

  // Calendar sync worker — drains the calendar outbox (push/patch/cancel
  // to Google/Microsoft/CalDAV), refreshes the external-event mirror,
  // and recomputes follow-ups. See CALENDAR_FEATURE.md §9.
  const { startCalendarWorker } = await import("@/lib/calendar-sync-worker");
  startCalendarWorker();
}
