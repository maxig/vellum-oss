// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import { Icons } from "@/components/Icons";

/**
 * CvViewer — best-effort inline preview of an uploaded resume.
 *
 * PDF (.pdf)            → inline <iframe> (Chrome/Safari/Firefox native viewers)
 * Image (jpg/png/webp)  → inline <img>
 * Anything else (docx)  → friendly fallback card with download link
 */
export default function CvViewer({
  url,
  name,
  height = 520,
}: {
  url: string;
  name?: string | null;
  height?: number;
}) {
  const ext = (name?.split(".").pop() || url.split(".").pop() || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  const isPdf = ext === "pdf";
  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"].includes(ext);

  if (isPdf) {
    return (
      <iframe
        src={url}
        title={name || "Resume"}
        style={{
          width: "100%",
          height,
          border: "0.5px solid var(--line)",
          borderRadius: 10,
          background: "var(--bg-1)",
        }}
      />
    );
  }

  if (isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name || "Resume"}
        style={{
          width: "100%",
          maxHeight: height,
          objectFit: "contain",
          borderRadius: 10,
          border: "0.5px solid var(--line)",
          background: "var(--bg-1)",
        }}
      />
    );
  }

  // Unknown / .docx — show a friendly fallback. (We deliberately don't try to
  // render docx inline; recruiters can download or open in a new tab.)
  return (
    <div
      style={{
        padding: 24,
        borderRadius: 10,
        border: "0.5px dashed var(--line)",
        background: "var(--glass-bg-faint)",
        textAlign: "center",
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <Icons.FileText size={22} style={{ color: "var(--ink-2)" }} />
      </div>
      <div style={{ fontSize: 13, marginBottom: 4 }}>
        Preview not available for <b>.{ext || "this file"}</b>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
        Download or open the file directly to view it.
      </p>
      <div className="row" style={{ gap: 8, justifyContent: "center" }}>
        <a href={url} target="_blank" rel="noreferrer" className="btn btn-sm">
          <Icons.ArrowUpRight size={12} /> Open in new tab
        </a>
        <a href={url} download className="btn btn-sm btn-ghost">
          Download
        </a>
      </div>
    </div>
  );
}
