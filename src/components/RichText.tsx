// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import { sanitizeRichText } from "@/lib/sanitize";

/**
 * Render sanitized HTML coming from the WYSIWYG editor.
 *
 * Always re-sanitizes at render time — defense in depth, even though the
 * /api/career-site endpoint also sanitizes on write. The `richtext` class
 * provides the typographic styling that matches the design.
 */
export default function RichText({
  html,
  className,
  as: As = "div",
  fallback,
  style,
}: {
  html: string | null | undefined;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
  fallback?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const clean = sanitizeRichText(html);
  if (!clean.trim()) {
    return fallback ? <>{fallback}</> : null;
  }
  return (
    <As
      className={["richtext", className].filter(Boolean).join(" ")}
      style={style}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
