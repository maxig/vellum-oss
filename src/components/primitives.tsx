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

export { Icons };
