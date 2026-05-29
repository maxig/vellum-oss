// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import Link from "next/link";
import ThemeBoot from "@/components/ThemeBoot";
import CookieConsent, { CookiePreferencesLink } from "@/components/CookieConsent";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ThemeBoot prefs={{ theme: "light", density: "cozy", accent: "indigo", glassIntensity: 1.0 }} />
      <div className="ambient"><div className="blob" /></div>
      <div className="legal-shell scroll-y">
        <header className="legal-nav">
          <Link href="/" className="row" style={{ gap: 10, textDecoration: "none" }}>
            <span className="gs-mark" />
            <span className="gs-name">Vellum</span>
          </Link>
          <div style={{ flex: 1 }} />
          <Link className="tiny" href="/privacy" style={{ color: "var(--ink-1)", fontSize: 13 }}>Privacy</Link>
          <Link className="tiny" href="/terms" style={{ color: "var(--ink-1)", fontSize: 13 }}>Terms</Link>
          <Link className="tiny" href="/cookies" style={{ color: "var(--ink-1)", fontSize: 13 }}>Cookies</Link>
        </header>
        <main className="legal-main">{children}</main>
        <footer className="legal-footer">
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 10, marginBottom: 10 }}>
                <span className="gs-mark" />
                <span className="gs-name" style={{ fontSize: 14 }}>Vellum</span>
              </div>
              <div className="tiny">© {new Date().getFullYear()} Vellum. Open-source applicant tracking.</div>
            </div>
            <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
              <Link className="tiny" href="/privacy">Privacy</Link>
              <Link className="tiny" href="/terms">Terms</Link>
              <Link className="tiny" href="/cookies">Cookies</Link>
              <CookiePreferencesLink />
              <a className="tiny" href="mailto:hi@gordienok.com">hi@gordienok.com</a>
            </div>
          </div>
        </footer>
      </div>
      <CookieConsent />
    </>
  );
}
