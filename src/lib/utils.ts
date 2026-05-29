// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { randomBytes, createHash } from "crypto";

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "ws";
}

export function workspaceId(slug: string) {
  const hash = createHash("sha256").update(slug + Date.now()).digest("hex").slice(0, 7);
  return `ws_${slugify(slug)}_${hash}`;
}

export function token(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() || "?"
  );
}

export function relativeTime(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  if (day < 30) return `${Math.round(day / 7)}w ago`;
  if (day < 365) return `${Math.round(day / 30)}mo ago`;
  return `${Math.round(day / 365)}y ago`;
}

export function currencySymbol(code: string | null | undefined) {
  switch ((code || "EUR").toUpperCase()) {
    case "EUR": return "€";
    case "USD": return "$";
    case "GBP": return "£";
    case "JPY": return "¥";
    case "CNY": return "¥";
    case "INR": return "₹";
    case "CHF": return "CHF ";
    case "SEK": return "kr ";
    case "NOK": return "kr ";
    case "DKK": return "kr ";
    case "PLN": return "zł ";
    case "CAD": return "CA$";
    case "AUD": return "A$";
    case "BRL": return "R$";
    case "MXN": return "MX$";
    default:    return `${(code || "").toUpperCase()} `;
  }
}

export function fmtMoney(min: number | null | undefined, max: number | null | undefined, currency = "EUR") {
  if (!min && !max) return null;
  const sign = currencySymbol(currency);
  const fmt = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v));
  if (min && max) return `${sign}${fmt(min)} – ${sign}${fmt(max)}`;
  return `${sign}${fmt((min || max)!)}`;
}

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
