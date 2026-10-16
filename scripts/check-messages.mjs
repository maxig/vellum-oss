// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// Compares every messages/<locale>/*.json against English (the source of
// truth): reports keys missing from a translation, keys a translation has
// that English doesn't, and messages whose {placeholders} or <tags> differ.
// Missing keys only fall back to English at runtime, so they're warnings;
// extra keys and placeholder mismatches are errors (exit code 1).
//
//   node scripts/check-messages.mjs

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "messages");
const locales = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "en")
  .map((d) => d.name);

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = String(v);
  }
  return out;
}

// ICU argument names ({name}, {count, plural, …}) and rich-text tags (<b>…</b>),
// read from the parsed message so plural/select option text isn't mistaken for
// an argument. The parser ships with next-intl (via use-intl).
const { parse } = await import("@formatjs/icu-messageformat-parser");
function tokens(msg) {
  const found = new Set();
  const walk = (nodes) => {
    for (const n of nodes) {
      // 1 argument, 2 number, 3 date, 4 time, 5 select, 6 plural, 8 tag
      if ([1, 2, 3, 4, 5, 6].includes(n.type)) found.add(`{${n.value}}`);
      if (n.type === 8) found.add(`<${n.value}>`), walk(n.children);
      if (n.options) for (const o of Object.values(n.options)) walk(o.value);
    }
  };
  try {
    walk(parse(msg));
  } catch (e) {
    return `PARSE ERROR: ${e.message}`;
  }
  return [...found].sort().join(" ");
}

let errors = 0;
let warnings = 0;
for (const file of readdirSync(join(root, "en")).filter((f) => f.endsWith(".json"))) {
  const en = flatten(JSON.parse(readFileSync(join(root, "en", file), "utf8")));
  for (const [key, msg] of Object.entries(en)) {
    if (tokens(msg).startsWith("PARSE ERROR")) {
      console.error(`error en/${file}: ${key} — ${tokens(msg)}`);
      errors++;
    }
  }
  for (const locale of locales) {
    let other;
    try {
      other = flatten(JSON.parse(readFileSync(join(root, locale, file), "utf8")));
    } catch {
      console.warn(`warn  ${locale}/${file}: missing file (falls back to English)`);
      warnings++;
      continue;
    }
    for (const key of Object.keys(en)) {
      if (!(key in other)) {
        console.warn(`warn  ${locale}/${file}: missing ${key}`);
        warnings++;
      } else if (tokens(other[key]).startsWith("PARSE ERROR")) {
        console.error(`error ${locale}/${file}: ${key} — ${tokens(other[key])}`);
        errors++;
      } else if (tokens(en[key]) !== tokens(other[key])) {
        console.error(`error ${locale}/${file}: ${key} uses [${tokens(other[key])}], English uses [${tokens(en[key])}]`);
        errors++;
      }
    }
    for (const key of Object.keys(other)) {
      if (!(key in en)) {
        console.error(`error ${locale}/${file}: ${key} does not exist in English`);
        errors++;
      }
    }
  }
}
console.log(`${errors} error(s), ${warnings} warning(s) across ${locales.join(", ") || "no"} locale(s)`);
process.exit(errors ? 1 : 0);
