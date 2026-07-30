// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// Shared open/close for the mobile off-canvas sidebar. The Sidebar and Topbar
// are sibling components with no common React state, so we coordinate through
// a class on the shared `.app` ancestor — the CSS in globals.css keys the
// drawer + scrim off `.app.nav-open`. Purely client-side.

export function toggleMobileNav() {
  document.querySelector(".app")?.classList.toggle("nav-open");
}

export function closeMobileNav() {
  document.querySelector(".app")?.classList.remove("nav-open");
}
