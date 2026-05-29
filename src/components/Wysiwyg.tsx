// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import { Icons } from "@/components/Icons";
import { markdownToHtml } from "@/lib/markdown";

/**
 * Minimal rich-text editor for career-site copy.
 *
 * Uses contentEditable + document.execCommand. execCommand is deprecated, but
 * still ships in every evergreen browser and lets us avoid a 50kb editor dep
 * for a tiny "type, bold, italic, link, list" surface.
 *
 * Emits HTML; pair with sanitizeRichText() on save.
 *
 * Incoming `value` strings can be either real HTML (what we round-trip while
 * editing) or plain text / markdown coming from outside the editor — AI
 * rewrites, seed data, callers pasting `\n`-separated copy. Anything without
 * HTML tags is run through `markdownToHtml` before painting so newlines,
 * paragraph breaks and special characters (`&`, `<`, em-dashes, smart quotes)
 * render correctly instead of collapsing to whitespace or being mis-parsed.
 */

function normaliseIncomingValue(raw: string): string {
  if (!raw) return "";
  // markdownToHtml already short-circuits on HTML — it returns the input
  // unchanged when it detects existing tags, so this is safe to call
  // unconditionally.
  return markdownToHtml(raw);
}
export default function Wysiwyg({
  value,
  onChange,
  placeholder,
  minHeight = 100,
  maxLines = 20,
  maxHeight,
  onKeyDown: onKeyDownProp,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /**
   * Forwarded to the editable surface, runs after the internal markdown-shortcut
   * handler. Useful for keyboard send shortcuts (⌘↵, etc.).
   */
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  /**
   * Soft cap on the editor's height, measured in text lines. Defaults to 20.
   * The editor auto-grows up to whichever of `maxLines` or `maxHeight` is
   * smaller, then scrolls internally.
   */
  maxLines?: number;
  /**
   * Hard cap as a CSS length (e.g. `"320px"`, `"50vh"`). Defaults to `"50vh"`
   * so editors never grow taller than half the viewport.
   */
  maxHeight?: string;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [focused, setFocused] = React.useState(false);
  // Remembers the last HTML we emitted to the parent, so we can tell the
  // difference between value changes that came from us (typing — DOM is already
  // up to date) and value changes that came from outside (form reset, AI
  // rewrite, etc). Without this guard, every keystroke re-sets innerHTML and
  // jumps the cursor to the start of the field.
  const lastEmittedRef = React.useRef<string>(value || "");

  React.useEffect(() => {
    // Tell contentEditable to use <p> for new paragraphs instead of <div>,
    // so paragraph breaks survive the sanitizer round-trip.
    try {
      document.execCommand("defaultParagraphSeparator", false, "p");
    } catch {
      /* not supported in test envs */
    }
  }, []);

  // Paint the initial value once, on mount. We do this in a layout effect
  // (rather than the inline ref callback that used to live on the editable
  // div) so it runs exactly once — an inline ref callback re-runs on every
  // render, which would re-apply markdownToHtml after the first keystroke
  // and reset the caret to the start of the field.
  React.useLayoutEffect(() => {
    if (!ref.current) return;
    const html = normaliseIncomingValue(value || "");
    if (ref.current.innerHTML !== html) {
      ref.current.innerHTML = html;
    }
    lastEmittedRef.current = value || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!ref.current) return;
    if (value === lastEmittedRef.current) return; // came from our own onChange
    // Convert plain text / markdown to HTML so AI-generated copy with literal
    // `\n` characters renders as paragraphs and line breaks rather than
    // collapsing to a single line of text in the contentEditable surface.
    const html = normaliseIncomingValue(value || "");
    // Remember the *original* value (not the converted HTML) so when the
    // parent re-renders with the same external value we don't repaint and
    // jump the caret. The next user keystroke will emit fresh HTML that
    // replaces this baseline.
    lastEmittedRef.current = value || "";
    if (ref.current.innerHTML !== html) {
      ref.current.innerHTML = html;
    }
  }, [value]);

  function exec(cmd: string, arg?: string) {
    if (!ref.current) return;
    ref.current.focus();
    // execCommand is deprecated but still implemented widely and avoids a Slate/TipTap dep.
    document.execCommand(cmd, false, arg);
    handleInput();
  }

  function handleInput() {
    if (!ref.current) return;
    // Run inline markdown shortcuts (e.g. **bold**, *italic*, `code`) after
    // each text insertion. Block shortcuts (# heading, - list, > quote) are
    // handled in onKeyDown so we can swallow the space.
    tryInlineMarkdown(ref.current);
    const html = ref.current.innerHTML;
    lastEmittedRef.current = html;
    onChange(html);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!ref.current) return;
    if (e.key === " " || e.key === "Spacebar") {
      if (tryBlockMarkdownOnSpace(ref.current)) {
        e.preventDefault();
        const html = ref.current.innerHTML;
        lastEmittedRef.current = html;
        onChange(html);
      }
    }
    if (!e.defaultPrevented) onKeyDownProp?.(e);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    // Strip formatting on paste so users don't drag in inline styles from Google Docs.
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  }

  function makeLink() {
    const url = window.prompt("Link URL", "https://");
    if (!url) return;
    if (!/^(https?:|mailto:|tel:|\/|#)/i.test(url)) {
      alert("Only http/https, mailto, tel, # or / links are allowed.");
      return;
    }
    exec("createLink", url);
  }

  const isEmpty = !value || value === "<br>" || value === "<p></p>";

  return (
    <div
      className={`wysiwyg ${focused ? "wysiwyg-focused" : ""}`}
      style={{
        border: "0.5px solid var(--line)",
        borderRadius: 10,
        background: "var(--glass-bg-faint)",
        overflow: "hidden",
      }}
    >
      <div
        className="wysiwyg-toolbar"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: "6px 8px",
          borderBottom: "0.5px solid var(--line)",
          background: "var(--glass-bg)",
          flexWrap: "wrap",
        }}
      >
        <ToolButton label="Bold" onClick={() => exec("bold")} title="Bold (Cmd-B)">
          <b style={{ fontSize: 13 }}>B</b>
        </ToolButton>
        <ToolButton label="Italic" onClick={() => exec("italic")} title="Italic (Cmd-I)">
          <i style={{ fontSize: 13 }}>I</i>
        </ToolButton>
        <ToolButton label="Underline" onClick={() => exec("underline")} title="Underline">
          <u style={{ fontSize: 13 }}>U</u>
        </ToolButton>
        <Sep />
        <ToolButton label="Heading" onClick={() => exec("formatBlock", "<h3>")} title="Subheading">
          <span style={{ fontSize: 12, fontWeight: 600 }}>H</span>
        </ToolButton>
        <ToolButton label="Paragraph" onClick={() => exec("formatBlock", "<p>")} title="Paragraph">
          <span style={{ fontSize: 11 }}>¶</span>
        </ToolButton>
        <Sep />
        <ToolButton label="Bullet list" onClick={() => exec("insertUnorderedList")} title="Bullet list">
          <span style={{ fontSize: 12 }}>•</span>
        </ToolButton>
        <ToolButton label="Numbered list" onClick={() => exec("insertOrderedList")} title="Numbered list">
          <span style={{ fontSize: 11 }}>1.</span>
        </ToolButton>
        <Sep />
        <ToolButton label="Link" onClick={makeLink} title="Add link">
          <Icons.ArrowUpRight size={12} />
        </ToolButton>
        <ToolButton label="Clear formatting" onClick={() => exec("removeFormat")} title="Clear formatting">
          <span style={{ fontSize: 11 }}>⌫</span>
        </ToolButton>
      </div>
      <div
        ref={ref}
        className="wysiwyg-area"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder || ""}
        data-empty={isEmpty ? "true" : "false"}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          padding: "10px 12px",
          minHeight,
          // Editor grows with content up to the smaller of `maxLines` (in em)
          // or `maxHeight`, then scrolls. 1.55em is our line-height; +20px is
          // the vertical padding.
          maxHeight: `min(calc(${maxLines} * 1em + 20px), ${maxHeight || "50vh"})`,
          overflowY: "auto",
          outline: "none",
          fontSize: 14,
          lineHeight: 1.55,
          color: "var(--ink-0)",
        }}
      />
    </div>
  );
}

function ToolButton({
  children,
  onClick,
  label,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="iconbtn"
      onMouseDown={(e) => e.preventDefault()} // keep selection in the editable
      onClick={onClick}
      aria-label={label}
      title={title || label}
      style={{ width: 26, height: 26, fontFamily: "inherit" }}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span style={{ width: 1, height: 16, background: "var(--line)", margin: "0 4px", display: "inline-block" }} />;
}

// ─── Markdown shortcut handlers ──────────────────────────────────────────
//
// These run inside the contentEditable surface and convert just-typed markdown
// fragments into real HTML on the fly:
//
//   **text** / __text__   → <b>text</b>
//   *text*  / _text_      → <i>text</i>
//   ~~text~~              → <s>text</s>
//   At line start, on space:
//     #   → <h2>, ##/### → <h3>, > → <blockquote>, -/* → <ul>, 1. → <ol>
//
// The implementation walks the DOM directly rather than parsing the whole
// editor's HTML so we don't blow away the caret, undo history, or other
// inline formatting around the match.

function currentBlock(root: HTMLElement): HTMLElement | null {
  const sel = typeof window === "undefined" ? null : window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;
  let node: Node | null = range.startContainer;
  if (node && node.nodeType === 3) node = node.parentNode;
  while (node && node !== root) {
    if (node.nodeType === 1) {
      const el = node as HTMLElement;
      const tag = el.tagName;
      if (tag === "P" || tag === "DIV" || tag === "LI" || tag === "BLOCKQUOTE" || /^H[1-6]$/.test(tag)) {
        return el;
      }
    }
    node = node.parentNode;
  }
  // No block ancestor — the user is typing into a virgin contentEditable that
  // hasn't been wrapped in a <p> yet. Treat the editor root as the block so
  // shortcuts like `# ` still fire on the very first line.
  return root;
}

function removeLeadingChars(block: HTMLElement, n: number) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let remaining = n;
  while (remaining > 0) {
    const node = walker.nextNode() as Text | null;
    if (!node) break;
    const take = Math.min(remaining, node.data.length);
    node.data = node.data.slice(take);
    remaining -= take;
  }
}

function placeCaretAtEnd(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function tryBlockMarkdownOnSpace(root: HTMLElement): boolean {
  const block = currentBlock(root);
  if (!block) return false;
  // Don't double-convert inside list items.
  if (block.tagName === "LI") return false;
  // Text from block start up to the caret.
  const sel = window.getSelection()!;
  const range = sel.getRangeAt(0);
  const preRange = document.createRange();
  preRange.selectNodeContents(block);
  preRange.setEnd(range.endContainer, range.endOffset);
  const prefix = preRange.toString();

  type Action = () => void;
  const apply = (chars: number, action: Action) => {
    removeLeadingChars(block, chars);
    action();
    const after = currentBlock(root) || block;
    placeCaretAtEnd(after);
    return true;
  };

  if (prefix === "###") return apply(3, () => document.execCommand("formatBlock", false, "h3"));
  if (prefix === "##") return apply(2, () => document.execCommand("formatBlock", false, "h3"));
  if (prefix === "#") return apply(1, () => document.execCommand("formatBlock", false, "h2"));
  if (prefix === ">") return apply(1, () => document.execCommand("formatBlock", false, "blockquote"));
  if (prefix === "-" || prefix === "*") return apply(1, () => document.execCommand("insertUnorderedList"));
  if (prefix === "1.") return apply(2, () => document.execCommand("insertOrderedList"));
  return false;
}

// Inline patterns are matched against the text node containing the caret.
// Each entry: [regex anchored at end-of-substring, group index that contains
// the captured inner text, wrapper tag, length of opening + closing markers].
const INLINE_PATTERNS: { re: RegExp; tag: string; markerLen: number; leadingChar: boolean }[] = [
  // Order matters — longer patterns first so `**foo**` isn't treated as `*foo*`.
  { re: /\*\*([^\s*][^*]*?)\*\*$/, tag: "b", markerLen: 2, leadingChar: false },
  { re: /__([^\s_][^_]*?)__$/, tag: "b", markerLen: 2, leadingChar: false },
  { re: /~~([^\s~][^~]*?)~~$/, tag: "s", markerLen: 2, leadingChar: false },
  { re: /(^|[^*])\*([^\s*][^*]*?)\*$/, tag: "i", markerLen: 1, leadingChar: true },
  { re: /(^|[^_])_([^\s_][^_]*?)_$/, tag: "i", markerLen: 1, leadingChar: true },
];

function tryInlineMarkdown(root: HTMLElement): boolean {
  const sel = typeof window === "undefined" ? null : window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return false;
  const node = range.startContainer;
  if (node.nodeType !== 3) return false;
  const text = (node as Text).data;
  const offset = range.startOffset;
  if (offset < 3) return false; // shortest pattern is *a*
  const before = text.slice(0, offset);

  for (const pat of INLINE_PATTERNS) {
    const m = before.match(pat.re);
    if (!m) continue;
    // For patterns with a leading non-marker char in the regex, the captured
    // inner text is group 2 and we exclude the leading char from the slice.
    const inner = pat.leadingChar ? m[2] : m[1];
    if (!inner) continue;
    const fullLen = inner.length + pat.markerLen * 2;
    const startInNode = offset - fullLen;
    if (startInNode < 0) continue;

    const replaceRange = document.createRange();
    replaceRange.setStart(node, startInNode);
    replaceRange.setEnd(node, offset);
    replaceRange.deleteContents();

    const el = document.createElement(pat.tag);
    el.appendChild(document.createTextNode(inner));
    replaceRange.insertNode(el);

    // Place the caret immediately after the new element. We do NOT insert a
    // zero-width space here — that would leak into the saved HTML. Most
    // browsers correctly leave the caret outside the inline tag at this point;
    // pressing the right arrow once is the usual escape hatch otherwise.
    const newRange = document.createRange();
    newRange.setStartAfter(el);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    return true;
  }
  return false;
}
