// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Tiny, single-pass markdown → HTML converter.
 *
 * Scoped to the subset the Wysiwyg editor understands so AI-generated copy
 * (which usually comes back as markdown) lands in the editor already shaped
 * as the same HTML you'd get from typing it manually.
 *
 * Supported:
 *   - Headings:    `# H1` → h2,  `## H2` / `### H3` → h3
 *   - Lists:       `- item` / `* item` → <ul><li>…</li></ul>
 *                  `1. item`            → <ol><li>…</li></ol>
 *   - Blockquote:  `> quoted`           → <blockquote>…</blockquote>
 *   - Bold/italic: **bold** / __bold__, *italic* / _italic_, ~~strike~~
 *   - Links:       [text](url)
 *   - Paragraphs:  blank-line separated
 *   - Hard breaks: two trailing spaces, or backslash + newline
 *
 * Anything more exotic (tables, footnotes, code blocks) is intentionally
 * dropped — the Wysiwyg sanitizer would strip it anyway. Existing HTML in
 * the input is passed through unchanged so this is safe to call on text
 * that's already been formatted.
 */

const HTML_TAG_RE = /<\/?[a-zA-Z][\w-]*\b[^>]*>/;

/**
 * Returns the input rendered as HTML. If `md` already contains HTML tags
 * we treat it as already-rendered and pass through untouched.
 */
export function markdownToHtml(md: string | null | undefined): string {
  if (typeof md !== "string" || md.length === 0) return "";
  // Already HTML — leave alone. The Wysiwyg sanitizer is the safety net.
  if (HTML_TAG_RE.test(md)) return md;

  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let inList: "ul" | "ol" | null = null;

  const closeList = () => {
    if (inList) {
      out.push(`</${inList}>`);
      inList = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line → paragraph break.
    if (trimmed === "") {
      closeList();
      i++;
      continue;
    }

    // Headings — `###` first so `##` doesn't eat the third `#`.
    const heading =
      /^### +(.*)$/.exec(trimmed) ||
      /^## +(.*)$/.exec(trimmed) ||
      /^# +(.*)$/.exec(trimmed);
    if (heading) {
      closeList();
      const level = trimmed.startsWith("### ") ? "h3" : trimmed.startsWith("## ") ? "h3" : "h2";
      out.push(`<${level}>${inline(heading[1])}</${level}>`);
      i++;
      continue;
    }

    // Blockquote — collapse consecutive `> …` lines into one block.
    if (/^> ?/.test(trimmed)) {
      closeList();
      const collected: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        collected.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${inline(collected.join("\n"))}</blockquote>`);
      continue;
    }

    // Lists.
    const ulMatch = /^[-*] +(.*)$/.exec(trimmed);
    const olMatch = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (ulMatch || olMatch) {
      const wanted: "ul" | "ol" = ulMatch ? "ul" : "ol";
      if (inList && inList !== wanted) closeList();
      if (!inList) {
        out.push(`<${wanted}>`);
        inList = wanted;
      }
      out.push(`<li>${inline((ulMatch || olMatch)![1])}</li>`);
      i++;
      continue;
    }

    closeList();

    // Paragraph — gather successive non-blank, non-block lines.
    const para: string[] = [line];
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j];
      const t = next.trim();
      if (
        t === "" ||
        /^#{1,3} /.test(t) ||
        /^> ?/.test(t) ||
        /^[-*] +/.test(t) ||
        /^\d+\.\s+/.test(t)
      ) {
        break;
      }
      para.push(next);
      j++;
    }
    out.push(`<p>${inline(para.join("\n"))}</p>`);
    i = j;
  }

  closeList();
  return out.join("");
}

function inline(s: string): string {
  let v = escapeHtml(s);

  // Hard breaks: trailing two spaces or a backslash at end of line — these
  // are unambiguous markdown line breaks.
  v = v.replace(/(?: {2,}|\\)\n/g, "<br>");
  // GFM-style: any remaining newline inside a paragraph is a soft line
  // break. We render it as `<br>` rather than the traditional markdown
  // collapse-to-space because AI output and human-written copy almost
  // always treat a newline as a deliberate visual break (otherwise they'd
  // have written one long line). Paragraph splits still come from blank
  // lines and are handled by the block-level loop above.
  v = v.replace(/\n/g, "<br>");

  // Links: [text](url). Allow only http/https/mailto/tel/# / so users can't
  // smuggle javascript: hrefs through the AI.
  v = v.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
    const safe = /^(https?:|mailto:|tel:|#|\/)/i.test(url.trim());
    if (!safe) return text;
    return `<a href="${url.trim()}" target="_blank" rel="noreferrer">${text}</a>`;
  });

  // Order matters — match the longest opener first so `**bold**` doesn't
  // collapse into nested `*italic*`s.
  v = v.replace(/\*\*([^\s*][^*]*?)\*\*/g, "<b>$1</b>");
  v = v.replace(/__([^\s_][^_]*?)__/g, "<b>$1</b>");
  v = v.replace(/~~([^\s~][^~]*?)~~/g, "<s>$1</s>");
  v = v.replace(/(^|[^*])\*([^\s*][^*]*?)\*(?!\*)/g, "$1<i>$2</i>");
  v = v.replace(/(^|[^_])_([^\s_][^_]*?)_(?!_)/g, "$1<i>$2</i>");

  return v;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
