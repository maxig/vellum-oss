// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import { Icons } from "./Icons";

// ── Glass container ──────────────────────────────────────────────────
export function Glass({
  as: As = "div",
  strong,
  faint,
  className = "",
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: any; strong?: boolean; faint?: boolean }) {
  const cls = `glass ${strong ? "glass-strong" : ""} ${faint ? "glass-faint" : ""} ${className}`.trim();
  return (
    <As className={cls} {...rest}>
      {children}
    </As>
  );
}

// ── Chip ──────────────────────────────────────────────────────────────
export function Chip({
  children,
  accent,
  warn,
  good,
  danger,
  dot,
  style,
}: {
  children: React.ReactNode;
  accent?: boolean;
  warn?: boolean;
  good?: boolean;
  danger?: boolean;
  dot?: boolean | string;
  style?: React.CSSProperties;
}) {
  const cls = [
    "chip",
    accent && "chip-accent",
    warn && "chip-warn",
    good && "chip-good",
    danger && "chip-danger",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} style={style}>
      {dot && <span className="chip-dot" style={typeof dot === "string" ? { background: dot } : undefined} />}
      {children}
    </span>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────
function avatarHue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}
export function Avatar({
  name = "",
  size = "md",
  style,
  src,
}: {
  name?: string;
  size?: "sm" | "md" | "lg" | "xl";
  style?: React.CSSProperties;
  src?: string | null;
}) {
  const init =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?";
  const hue = avatarHue(name);
  const bg = `linear-gradient(135deg, oklch(70% 0.16 ${hue}), oklch(58% 0.18 ${(hue + 40) % 360}))`;
  return (
    <span className={`avatar avatar-${size}`} style={{ background: src ? undefined : bg, ...style }}>
      {src ? <img src={src} alt={name} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : init}
    </span>
  );
}

// ── AI Pill ──────────────────────────────────────────────────────────
export function AIPill({ children = "AI" }: { children?: React.ReactNode }) {
  return (
    <span className="ai-pill">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l1.8 4.5L18 8l-4.2 1.5L12 14l-1.8-4.5L6 8l4.2-1.5L12 2zM18 14l1 2.5L21 18l-2 .5L18 21l-1-2.5L15 18l2-.5L18 14z" />
      </svg>
      {children}
    </span>
  );
}

// ── Workspace mark ────────────────────────────────────────────────────
export function WorkspaceMark({
  workspace,
  size = 22,
}: {
  workspace: { name: string; color: string };
  size?: number;
}) {
  if (workspace.color === "conic") {
    return (
      <div
        className="gs-mark"
        style={{ width: size, height: size, borderRadius: 6 }}
      />
    );
  }
  const initial = (workspace.name[0] || "?").toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: `linear-gradient(135deg, ${workspace.color}, color-mix(in oklab, ${workspace.color} 70%, black))`,
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.max(10, size / 2),
        boxShadow: "0 1px 0 rgba(255,255,255,0.25) inset",
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

// ── Section head ──────────────────────────────────────────────────────
export function SectionHead({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="row" style={{ marginBottom: 14, alignItems: "baseline" }}>
      <h2 style={{ flex: 1 }}>{children}</h2>
      {action}
    </div>
  );
}

// ── Ring score ────────────────────────────────────────────────────────
export function RingScore({ value, size = 56 }: { value: number; size?: number }) {
  return (
    <div className="ringscore" style={{ ["--p" as any]: (value / 100).toFixed(2), ["--sz" as any]: `${size}px` }}>
      <span>{value}</span>
    </div>
  );
}

// ── Star rating ───────────────────────────────────────────────────────
// Warm gold that reads on both themes. Kept here so cards, lists, the
// profile drawer, and the debrief form all render identical stars.
export const STAR_GOLD = "oklch(78% 0.15 82)";

// A single star that can fill fractionally (for showing an average like
// 3.7): an empty outline underneath, a gold star clipped to `fill`% on top.
function StarGlyph({ size, fill }: { size: number; fill: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, fill)) * 100);
  return (
    <span style={{ position: "relative", display: "inline-block", width: size, height: size, lineHeight: 0 }}>
      <Icons.Star size={size} fill="none" stroke={1.5} style={{ color: "var(--ink-3)", position: "absolute", inset: 0 }} />
      {pct > 0 && (
        <span style={{ position: "absolute", inset: 0, width: `${pct}%`, overflow: "hidden" }}>
          <Icons.Star size={size} fill={STAR_GOLD} stroke={0} style={{ color: STAR_GOLD }} />
        </span>
      )}
    </span>
  );
}

// Two modes, chosen by whether `onChange` is passed:
//   • display  — renders `value` (may be fractional) plus an optional count.
//   • interactive — 1..max buttons; clicking the current value clears it.
export function Stars({
  value,
  count,
  max = 5,
  size = 14,
  gap = 2,
  onChange,
  clearable = true,
  showValue = false,
  ariaLabel = "Rating",
}: {
  value: number | null;
  count?: number;
  max?: number;
  size?: number;
  gap?: number;
  onChange?: (n: number | null) => void;
  clearable?: boolean;
  showValue?: boolean;
  ariaLabel?: string;
}) {
  const [hover, setHover] = React.useState<number | null>(null);

  if (!onChange) {
    const v = Math.max(0, Math.min(max, value ?? 0));
    return (
      <span
        className="stars"
        style={{ display: "inline-flex", alignItems: "center", gap }}
        title={value != null ? `${v} of ${max}${count ? ` · ${count} review${count === 1 ? "" : "s"}` : ""}` : "No rating yet"}
        aria-label={value != null ? `${v} out of ${max}` : "No rating yet"}
      >
        {Array.from({ length: max }).map((_, i) => (
          <StarGlyph key={i} size={size} fill={i < Math.floor(v) ? 1 : i === Math.floor(v) ? v - Math.floor(v) : 0} />
        ))}
        {showValue && value != null && (
          <span className="tiny" style={{ marginLeft: 3, color: "var(--ink-1)", fontVariantNumeric: "tabular-nums" }}>
            {v.toFixed(1)}
            {count ? <span className="muted"> ({count})</span> : null}
          </span>
        )}
      </span>
    );
  }

  const shown = hover ?? value ?? 0;
  return (
    <span className="stars" role="radiogroup" aria-label={ariaLabel} style={{ display: "inline-flex", alignItems: "center", gap }}>
      {Array.from({ length: max }).map((_, i) => {
        const n = i + 1;
        const active = n <= shown;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onChange(clearable && value === n ? null : n)}
            style={{
              width: size + 6,
              height: size + 6,
              display: "grid",
              placeItems: "center",
              background: "none",
              border: 0,
              padding: 0,
              cursor: "pointer",
              color: active ? STAR_GOLD : "var(--ink-3)",
            }}
          >
            <Icons.Star size={size} fill={active ? STAR_GOLD : "none"} stroke={active ? 0 : 1.5} />
          </button>
        );
      })}
    </span>
  );
}

export { Icons };
