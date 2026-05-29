// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";

/**
 * Topbar "Review queue" button. Shows a count chip per spec §3:
 *   - 0     → outline button, no badge
 *   - 1-9   → filled badge with the count
 *   - 10+   → "9+" with a pulse if any cached item is flagged urgent
 *
 * Reads the cached queue via the shared useReviewQueueCount hook so the
 * topbar and the sidebar CTA show the same number.
 */

import * as React from "react";
import { Icons } from "@/components/Icons";
import { useProfileSheet } from "@/components/SheetHost";
import { useReviewQueueCount } from "@/components/useReviewQueueCount";

export default function ReviewQueueButton() {
  const { openReviewQueue } = useProfileSheet();
  const { count, hasUrgent } = useReviewQueueCount();

  const label = "Review queue";
  const c = count;
  const showBadge = c > 0;
  const badgeText = c > 9 ? "9+" : String(c);
  const pulse = c > 9 && hasUrgent;

  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={() => openReviewQueue()}
      title={label}
      style={{
        position: "relative",
        height: 32,
        padding: "0 12px",
        gap: 8,
      }}
      aria-label={`${label} — ${c} item${c === 1 ? "" : "s"}`}
    >
      <Icons.Sparkle size={13} stroke={2} />
      <span style={{ fontSize: 12.5 }}>{label}</span>
      {showBadge && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 18,
            height: 18,
            padding: "0 6px",
            fontSize: 10.5,
            fontWeight: 600,
            borderRadius: 999,
            background: pulse
              ? "color-mix(in oklab, oklch(60% 0.18 28) 90%, white)"
              : "var(--accent-soft)",
            color: pulse ? "white" : "var(--accent-solid)",
            animation: pulse ? "review-pulse 1.8s ease-in-out infinite" : undefined,
          }}
        >
          {badgeText}
        </span>
      )}
      <style jsx>{`
        @keyframes review-pulse {
          0%, 100% { box-shadow: 0 0 0 0 color-mix(in oklab, oklch(60% 0.18 28) 60%, transparent); }
          50%      { box-shadow: 0 0 0 4px color-mix(in oklab, oklch(60% 0.18 28) 0%, transparent); }
        }
      `}</style>
    </button>
  );
}
