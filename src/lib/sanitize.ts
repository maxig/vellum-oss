// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Tiny allow-list HTML sanitizer for rich text saved from the WYSIWYG editor.
 *
 * Why not DOMPurify? Adding a 50kb dep for a handful of tags is overkill — the
 * career-site editor only emits a small set of structural tags. This module
 * parses with a minimal state machine, drops anything outside the allowlist,
 * and strips every attribute except `href` on `<a>`.
 *
 * Safe to run on server (no DOM dependency).
 */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "ul",
  "ol",
  "li",
  "a",
  "h2",
  "h3",
  "blockquote",
  // contentEditable in Chrome/Safari wraps new lines in <div> by default.
  // Keep them so paragraph breaks survive the round-trip (we ship CSS that
  // treats them as paragraphs in .richtext).
  "div",
  // <span> is harmless once attributes are stripped, and browsers like to
  // emit it for partial formatting (e.g. an isolated bold word).
  "span",
]);

const VOID_TAGS = new Set(["br"]);

/**
 * Returns the input HTML stripped down to the allow-list, with safe href values
 * only (http/https/mailto). Best-effort: malformed inputs return cleaned text.
 */
export function sanitizeRichText(input: unknown): string {
  if (typeof input !== "string") return "";
  if (input.length === 0) return "";
  // Cap to keep server memory bounded.
  const src = input.length > 50_000 ? input.slice(0, 50_000) : input;

  let out = "";
  let i = 0;
  const stack: string[] = [];

  while (i < src.length) {
    const ch = src[i];

    if (ch !== "<") {
      // Consume a chunk of text up to the next "<" so escapeText can see
      // whole entities like &nbsp; instead of one character at a time.
      const nextTag = src.indexOf("<", i);
      const textEnd = nextTag === -1 ? src.length : nextTag;
      out += escapeText(src.slice(i, textEnd));
      i = textEnd;
      continue;
    }

    // Find the end of the tag.
    const end = src.indexOf(">", i + 1);
    if (end === -1) {
      // No closing bracket — drop the rest as text.
      out += escapeText(src.slice(i));
      break;
    }

    const raw = src.slice(i + 1, end).trim();
    i = end + 1;

    if (raw.length === 0 || raw.startsWith("!") || raw.startsWith("?")) {
      // Comment, doctype, or PI — drop entirely.
      continue;
    }

    const closing = raw.startsWith("/");
    const body = closing ? raw.slice(1).trim() : raw;
    const match = body.match(/^([a-zA-Z][a-zA-Z0-9]*)([\s\S]*)$/);
    if (!match) continue;

    const name = match[1].toLowerCase();
    if (!ALLOWED_TAGS.has(name)) continue;

    if (closing) {
      // Pop down to matching opener.
      const idx = stack.lastIndexOf(name);
      if (idx === -1) continue;
      while (stack.length > idx) {
        const popped = stack.pop()!;
        out += `</${popped}>`;
      }
      continue;
    }

    // Opening (or self-closing) tag.
    const attrs = match[2] || "";
    let attrOut = "";

    if (name === "a") {
      const hrefMatch =
        attrs.match(/\bhref\s*=\s*"([^"]*)"/i) ||
        attrs.match(/\bhref\s*=\s*'([^']*)'/i) ||
        attrs.match(/\bhref\s*=\s*([^\s>]+)/i);
      if (hrefMatch) {
        const href = hrefMatch[1].trim();
        if (isSafeUrl(href)) {
          attrOut = ` href="${escapeAttr(href)}" target="_blank" rel="noreferrer"`;
        }
      }
    }

    if (VOID_TAGS.has(name)) {
      out += `<${name}${attrOut} />`;
      continue;
    }

    stack.push(name);
    out += `<${name}${attrOut}>`;
  }

  // Close any tags left open.
  while (stack.length) {
    const popped = stack.pop()!;
    out += `</${popped}>`;
  }

  return out;
}

/**
 * Strip *all* HTML — for plain-text contexts (meta description, alt, etc).
 */
export function stripHtml(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Render incoming email content (HTML or plain text) as a flat readable string
 * suitable for a chat-style bubble.
 *
 * - `<a href>` becomes `text (url)` when text differs from the URL, else `url`.
 * - `<img>` becomes a `[image]` stub with the source URL so the recruiter can
 *   still see what came in without loading remote content.
 * - All other tags are stripped; entities decoded; runs of blank lines clamped.
 * - Pure text input (no `<` characters) is returned almost as-is (only
 *   collapsing whitespace), which keeps short candidate replies looking
 *   natural.
 */
export function emailToText(input: unknown): string {
  if (typeof input !== "string") return "";
  let s = input;
  // Fast path: looks like plain text already.
  const looksHtml = /<\s*\/?(p|br|div|table|tr|td|img|a|ul|ol|li|h[1-6]|span|b|strong|i|em|blockquote|style|head|html|body)\b/i.test(s);
  if (!looksHtml) {
    return decodeEntities(s).replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  // Drop <style>/<script>/<head> blocks wholesale.
  s = s.replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "");
  // Images → text stub.
  s = s.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = (tag.match(/\bsrc\s*=\s*"([^"]*)"/i) || tag.match(/\bsrc\s*=\s*'([^']*)'/i) || ["", ""])[1];
    const alt = (tag.match(/\balt\s*=\s*"([^"]*)"/i) || tag.match(/\balt\s*=\s*'([^']*)'/i) || ["", ""])[1];
    const label = alt.trim() || "image";
    return src ? `[${label}: ${src}]` : `[${label}]`;
  });
  // Links → text + url.
  s = s.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_match, attrs, inner) => {
    const hrefMatch =
      attrs.match(/\bhref\s*=\s*"([^"]*)"/i) ||
      attrs.match(/\bhref\s*=\s*'([^']*)'/i) ||
      attrs.match(/\bhref\s*=\s*([^\s>]+)/i);
    const href = hrefMatch ? hrefMatch[1].trim() : "";
    const text = stripHtml(inner).trim();
    if (!href) return text;
    if (!text || text === href) return href;
    return `${text} (${href})`;
  });
  // Block-level breaks.
  s = s
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|tr|li|h[1-6]|blockquote)\s*>/gi, "\n")
    .replace(/<\s*(p|div|tr|li|h[1-6]|blockquote)\b[^>]*>/gi, "\n");
  // Everything else: nuke tags.
  s = s.replace(/<[^>]*>/g, "");
  s = decodeEntities(s);
  // Collapse whitespace.
  s = s.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", copy: "©", reg: "®",
  };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => safeFromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => safeFromCharCode(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => named[name.toLowerCase()] ?? m);
}

function safeFromCharCode(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return "";
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}

function isSafeUrl(href: string) {
  if (!href) return false;
  if (href.startsWith("#") || href.startsWith("/")) return true;
  const lower = href.toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("mailto:") || lower.startsWith("tel:");
}

// Recognised named/numeric entities we want to preserve verbatim (so e.g.
// `&nbsp;` keeps rendering as a non-breaking space instead of being
// double-encoded to the literal text "&amp;nbsp;").
const ENTITY_RE = /^&(?:[a-zA-Z]{1,15}|#\d{1,7}|#x[0-9a-fA-F]{1,6});/;

function escapeText(s: string) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "&") {
      const tail = s.slice(i);
      const m = tail.match(ENTITY_RE);
      if (m) {
        out += m[0];
        i += m[0].length - 1;
        continue;
      }
      out += "&amp;";
    } else if (ch === "<") {
      out += "&lt;";
    } else if (ch === ">") {
      out += "&gt;";
    } else {
      out += ch;
    }
  }
  return out;
}

function escapeAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
