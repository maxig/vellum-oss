// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Review queue telemetry — structured-log events per §12.
 *
 * Phase 1 ships these to console.log as JSON so the operator can grep
 * them and so any downstream log aggregator can index them without code
 * changes. When the project gets a real analytics sink (Phase 3) the
 * `emit` function becomes the single replacement point — every event
 * call site is already keyed and shaped correctly.
 *
 * Properties never include PII. Candidate-level events carry the
 * candidate ID only because it's already a server-side identifier;
 * names and emails never appear here.
 */

type EventName =
  | "review_queue.cache_hit"
  | "review_queue.cache_miss"
  | "review_queue.opened"
  | "review_queue.item_action"
  | "review_queue.bucket_filter"
  | "review_queue.rules_edit"
  | "review_queue.refresh_manual"
  | "review_queue.ai_overlay";

type Props = Record<string, unknown>;

export function emit(event: EventName, props: Props = {}): void {
  // One line per event. JSON.stringify so commas in values don't break
  // log parsers; console.log so we benefit from Next's structured log
  // formatting in dev and production.
  try {
    console.log(`[telemetry] ${event} ${JSON.stringify(props)}`);
  } catch {
    // Defensive: if a prop contained a circular ref, fall back to a
    // plain key list rather than crashing the request.
    console.log(`[telemetry] ${event} <unserializable> keys=${Object.keys(props).join(",")}`);
  }
}
