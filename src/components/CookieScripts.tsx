// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import {
  CONSENT_CHANGED_EVENT,
  CONSENT_COOKIE,
  categoryAllowed,
  readConsentFromCookieString,
  type ConsentRecord,
  type CookieScript,
} from "@/lib/cookies";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const pair = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return pair ? pair.substring(name.length + 1) : null;
}

function inject(script: CookieScript): HTMLScriptElement | null {
  if (typeof document === "undefined") return null;
  const el = document.createElement("script");
  el.dataset.cookieScriptId = script.id;
  if (script.src) {
    el.src = script.src;
    el.async = true;
  } else if (script.code) {
    el.textContent = script.code;
  } else {
    return null;
  }
  document.head.appendChild(el);
  return el;
}

/**
 * Drops <script> tags into <head> for any configured script whose category
 * the visitor has consented to. Re-evaluates whenever the consent record
 * changes (banner Save / Accept all / Reject).
 */
export default function CookieScripts({ scripts }: { scripts: CookieScript[] }) {
  const enabled = React.useMemo(() => scripts.filter((s) => s.enabled !== false), [scripts]);
  const injectedRef = React.useRef<Map<string, HTMLScriptElement>>(new Map());

  const reconcile = React.useCallback(
    (consent: ConsentRecord | null) => {
      const map = injectedRef.current;
      for (const s of enabled) {
        const allowed = categoryAllowed(consent, s.category);
        const existing = map.get(s.id);
        if (allowed && !existing) {
          const el = inject(s);
          if (el) map.set(s.id, el);
        } else if (!allowed && existing) {
          existing.remove();
          map.delete(s.id);
        }
      }
      // Tear down anything no longer in the config.
      const validIds = new Set(enabled.map((s) => s.id));
      for (const [id, el] of map.entries()) {
        if (!validIds.has(id)) {
          el.remove();
          map.delete(id);
        }
      }
    },
    [enabled]
  );

  React.useEffect(() => {
    reconcile(readConsentFromCookieString(getCookie(CONSENT_COOKIE)));
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<ConsentRecord>).detail || readConsentFromCookieString(getCookie(CONSENT_COOKIE));
      reconcile(detail || null);
    };
    window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
    };
  }, [reconcile]);

  return null;
}
