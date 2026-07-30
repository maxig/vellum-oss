// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";

import * as React from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Minimal, dependency-free dialog accessibility for our glass sheets:
 *   • on open, remember the element that had focus and move focus into the
 *     dialog (first focusable, else the container itself);
 *   • trap Tab / Shift+Tab within the dialog so keyboard focus can't wander
 *     onto the page behind the scrim;
 *   • on close, restore focus to the opener.
 *
 * Escape is intentionally NOT handled here — each dialog keeps its own
 * Escape logic (some, like ProfileSheet, must ignore Escape while a child
 * modal is open).
 */
export function useDialogA11y(ref: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;

    const focusables = () =>
      node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];

    // Move focus in. Defer a tick so content mounted this render is present.
    const raf = requestAnimationFrame(() => {
      const els = focusables();
      if (els.length > 0) els[0].focus();
      else if (node) {
        node.setAttribute("tabindex", "-1");
        node.focus();
      }
    });

    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab" || !node) return;
      const active = document.activeElement;
      // A child dialog stacked above this one (e.g. the schedule / debrief /
      // reject modal over the profile drawer) runs its own trap — don't yank
      // focus out of it back into this dialog.
      if (active && !node.contains(active) && active.closest('[role="dialog"]')) return;
      const els = focusables();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey, true);
      // Restore focus to the opener if it's still in the document.
      if (opener && document.contains(opener)) opener.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
