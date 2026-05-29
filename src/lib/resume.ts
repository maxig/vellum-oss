// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { SmartPDFParser } from "pdf-parse-new";

const MAX_CHARS = 40_000;

export type ResumeParseResult = {
  text: string;
  pages: number | null;
  truncated: boolean;
};

/**
 * Extract plain text from an uploaded resume. PDFs are parsed with pdf-parse;
 * plain text files are decoded directly. Anything else (.docx, .rtf, …) returns
 * an empty result — recruiters can still preview the file via CvViewer, but the
 * AI summary will fall back to the structured candidate fields.
 */
export async function parseResume(file: {
  buffer: Buffer;
  name?: string | null;
  mimeType?: string | null;
}): Promise<ResumeParseResult> {
  const ext = (file.name?.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const mime = (file.mimeType || "").toLowerCase();

  if (ext === "pdf" || mime === "application/pdf") {
    return parsePdf(file.buffer);
  }

  if (ext === "txt" || mime.startsWith("text/")) {
    const text = clean(file.buffer.toString("utf8"));
    return {
      text: text.slice(0, MAX_CHARS),
      pages: null,
      truncated: text.length > MAX_CHARS,
    };
  }

  return { text: "", pages: null, truncated: false };
}

async function parsePdf(buffer: Buffer): Promise<ResumeParseResult> {
  const parser = new SmartPDFParser({ forceMethod: "workers" });
  const result = await parser.parse(buffer);
  const text = clean(result.text || "");
  return {
    text: text.slice(0, MAX_CHARS),
    pages: result.numpages ?? null,
    truncated: text.length > MAX_CHARS,
  };
}

function clean(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
