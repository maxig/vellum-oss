// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import { ACCENTS, type AccentKey } from "@/lib/design";

export type Prefs = {
  theme: "light" | "dark";
  density: "compact" | "cozy";
  accent: AccentKey;
  glassIntensity: number;
};

export function applyPrefs(p: Prefs) {
  if (typeof document === "undefined") return;
  const r = document.documentElement;
  r.setAttribute("data-theme", p.theme);
  r.setAttribute("data-density", p.density);
  const a = ACCENTS[p.accent] || ACCENTS.indigo;
  r.style.setProperty("--accent-1", a.a1);
  r.style.setProperty("--accent-2", a.a2);
  r.style.setProperty("--accent-solid", a.solid);
  r.style.setProperty("--accent-soft", `color-mix(in oklab, ${a.solid} 12%, transparent)`);
  const i = p.glassIntensity;
  r.style.setProperty("--glass-blur", `${Math.max(2, 22 * i)}px`);
}

export default function ThemeBoot({ prefs }: { prefs: Prefs }) {
  React.useEffect(() => {
    applyPrefs(prefs);
  }, [prefs.theme, prefs.density, prefs.accent, prefs.glassIntensity]);
  return null;
}
