// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  CATEGORY_ORDER,
  CONSENT_CHANGED_EVENT,
  CONSENT_COOKIE,
  CONSENT_VERSION,
  type ConsentRecord,
  emptyConsent,
  readConsentFromCookieString,
} from "@/lib/cookies";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const pair = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return pair ? pair.substring(name.length + 1) : null;
}

function writeConsent(record: ConsentRecord) {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(JSON.stringify(record));
  // 12-month consent lifetime — refreshed each time the user reopens preferences.
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: record }));

  // If any non-necessary category was denied, ask the server to clear
  // first-party cookies in those categories now. The browser can't
  // delete httpOnly cookies like `vellum_anon`, so without this call
  // they'd survive until next time `recordCareerEvent` runs (or 90 days,
  // whichever comes first).
  if (!record.functional || !record.marketing) {
    fetch("/api/cookies/sweep", { method: "POST", keepalive: true }).catch(() => {
      // Best-effort. The next server request will sweep too.
    });
  }
}

type Props = {
  /** Root of the policy pages — used to link from the banner. */
  policyBase?: string;
  /** Optional copy override (per-workspace banner customisation). */
  title?: string;
  message?: string;
};

export default function CookieConsent({ policyBase = "", title, message }: Props) {
  const t = useTranslations("consent");
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false); // banner visible?
  const [expanded, setExpanded] = React.useState(false); // detail panel visible?
  const [pending, setPending] = React.useState<ConsentRecord>(() => emptyConsent());

  React.useEffect(() => {
    setMounted(true);
    const existing = readConsentFromCookieString(getCookie(CONSENT_COOKIE));
    if (!existing) {
      setOpen(true);
      setPending(emptyConsent());
    }
    const onOpen = () => {
      const cur = readConsentFromCookieString(getCookie(CONSENT_COOKIE));
      setPending(cur || emptyConsent());
      setExpanded(true);
      setOpen(true);
    };
    window.addEventListener("vellum:open-cookie-preferences", onOpen);
    return () => window.removeEventListener("vellum:open-cookie-preferences", onOpen);
  }, []);

  if (!mounted || !open) return null;

  function decide(record: Partial<ConsentRecord>) {
    const next: ConsentRecord = {
      necessary: true,
      functional: !!record.functional,
      marketing: !!record.marketing,
      decidedAt: new Date().toISOString(),
      v: CONSENT_VERSION,
    };
    writeConsent(next);
    setOpen(false);
    setExpanded(false);
  }

  const policyHref = `${policyBase}/cookies`;

  return (
    <div className="cookie-banner-wrap" role="region" aria-label={t("region")}>
      <div className={`cookie-banner glass glass-strong${expanded ? " cookie-banner-tall" : ""}`}>
        {!expanded ? (
          <div className="cookie-banner-row">
            <div className="cookie-banner-copy">
              <strong>{title || t("title")}</strong>
              <span className="cookie-banner-msg">
                {message || t("message")}{" "}
                <Link href={policyHref} className="cookie-banner-link">
                  {t("policy")}
                </Link>
              </span>
            </div>
            <div className="cookie-banner-actions">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => decide({ functional: false, marketing: false })}
              >
                {t("reject")}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setPending({
                    necessary: true,
                    functional: false,
                    marketing: false,
                    decidedAt: new Date().toISOString(),
                    v: CONSENT_VERSION,
                  });
                  setExpanded(true);
                }}
              >
                {t("customize")}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => decide({ functional: true, marketing: true })}
              >
                {t("acceptAll")}
              </button>
            </div>
          </div>
        ) : (
          <div className="cookie-banner-detail">
            <div className="cookie-banner-detail-head">
              <div>
                <strong style={{ fontSize: 13.5 }}>{t("prefsTitle")}</strong>
                <div className="tiny" style={{ marginTop: 2 }}>
                  {t("prefsHint")}
                </div>
              </div>
              <Link href={policyHref} className="tiny cookie-banner-link" style={{ marginLeft: 12, whiteSpace: "nowrap" }}>
                {t("policy")} →
              </Link>
            </div>

            <div className="cookie-cats">
              {CATEGORY_ORDER.map((cat) => {
                const isNecessary = cat === "necessary";
                const checked = isNecessary ? true : !!pending[cat];
                return (
                  <label key={cat} className={`cookie-cat${checked ? " on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isNecessary}
                      onChange={(e) =>
                        !isNecessary && setPending({ ...pending, [cat]: e.target.checked } as ConsentRecord)
                      }
                    />
                    <div className="cookie-cat-text">
                      <div className="row" style={{ gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-0)" }}>{t(`categories.${cat}.title`)}</span>
                        {isNecessary && <span className="tiny" style={{ color: "var(--ink-2)" }}>{t("alwaysOn")}</span>}
                      </div>
                      <div className="tiny" style={{ marginTop: 2, lineHeight: 1.45 }}>{t(`categories.${cat}.blurb`)}</div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="cookie-banner-actions" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => decide({ functional: false, marketing: false })}
              >
                {t("rejectAll")}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => decide({ functional: pending.functional, marketing: pending.marketing })}
              >
                {t("save")}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => decide({ functional: true, marketing: true })}
              >
                {t("acceptAll")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Trigger that opens the preferences panel — used from page footers. */
export function CookiePreferencesLink({
  className = "tiny",
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const t = useTranslations("consent");
  return (
    <a
      href="#cookie-preferences"
      className={className}
      onClick={(e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("vellum:open-cookie-preferences"));
      }}
    >
      {children ?? t("preferences")}
    </a>
  );
}
