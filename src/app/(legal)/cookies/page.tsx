// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import type { Metadata } from "next";
import { CookiePreferencesLink } from "@/components/CookieConsent";
import { CATEGORY_LABELS, CATEGORY_ORDER, cookiesByCategory } from "@/lib/cookies";

export const metadata: Metadata = {
  title: "Cookie Policy — Vellum",
  description:
    "How Vellum uses cookies and similar technologies, what categories exist, and how you can change your choices.",
};

const EFFECTIVE = "May 28, 2026";

export default function CookiesPage() {
  return (
    <article className="legal-article">
      <div className="section-h" style={{ marginBottom: 8 }}>Legal</div>
      <h1>
        Cookie <span className="serif" style={{ fontStyle: "italic", fontWeight: 400, color: "var(--accent-solid)" }}>policy.</span>
      </h1>
      <p className="lede">
        This Cookie Policy explains how Vellum (&ldquo;we,&rdquo; &ldquo;us&rdquo;) uses cookies and similar
        technologies on our marketing website, application, and career sites operated on our platform. It should
        be read alongside our <a href="/privacy">Privacy Policy</a>.
      </p>
      <p className="tiny" style={{ marginTop: 6 }}>Effective date: {EFFECTIVE}</p>

      <h2>1. What is a cookie?</h2>
      <p>
        A cookie is a small text file stored on your device by your browser. Similar technologies (local storage,
        session storage, pixels) work in a comparable way. Cookies can be set by us (&ldquo;first-party&rdquo;) or
        by a third party whose script runs on the site (&ldquo;third-party&rdquo;).
      </p>

      <h2>2. Categories we use</h2>
      <p>We group cookies into three categories, matching the choices offered in the consent banner:</p>
      <h3>Strictly necessary</h3>
      <p>
        Required for the site to function. They keep you signed in, protect against CSRF, balance load between
        servers, and remember the consent choice you just made. These cannot be turned off because the site would
        not work without them.
      </p>
      <h3>Functional</h3>
      <p>
        Improve your experience by remembering preferences such as language, theme, and density, and by powering
        optional widgets like in-product chat or embedded video.
      </p>
      <h3>Marketing &amp; analytics</h3>
      <p>
        Help us understand how visitors and candidates use our sites and measure the effectiveness of campaigns.
        These run only after you opt in via the consent banner.
      </p>

      <h2>3. Cookies we set</h2>
      <p>
        Vellum sets the following first-party cookies. This list is generated from{" "}
        <code>FIRST_PARTY_COOKIES</code> in the source, so it stays in sync with what actually runs.
      </p>

      {CATEGORY_ORDER.map((cat) => {
        const items = cookiesByCategory(cat);
        if (!items.length) {
          return (
            <div key={cat} style={{ marginTop: 18 }}>
              <h3 style={{ margin: 0 }}>{CATEGORY_LABELS[cat].title}</h3>
              <p className="tiny" style={{ marginTop: 4 }}>
                None today. Reserved for future cookies in this category.
              </p>
            </div>
          );
        }
        return (
          <div key={cat} style={{ marginTop: 18 }}>
            <h3 style={{ margin: 0 }}>{CATEGORY_LABELS[cat].title}</h3>
            <table className="cookie-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Purpose</th>
                  <th>Lifetime</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.name}>
                    <td><code>{c.name}</code></td>
                    <td>{c.purpose}</td>
                    <td>{c.lifetime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      <p style={{ marginTop: 18 }}>
        <b>Enforcement.</b> Non-necessary cookies are not written at all until you opt in. For example,{" "}
        <code>vellum_anon</code> &mdash; the analytics session cookie that powers career-site funnel metrics
        &mdash; is only set after you grant the &ldquo;Marketing &amp; analytics&rdquo; category. If you reject
        or close the banner, no marketing or functional cookies are stored, and no marketing events are recorded
        against you.
      </p>

      <p>
        Career sites hosted on Vellum may load additional scripts that the workspace owner has added (for example,
        a web-analytics provider or an embedded chat widget). Those scripts are not injected into the page until
        you have consented to their category. The category and provider are listed in the banner&rsquo;s{" "}
        <CookiePreferencesLink className="cookie-banner-link">Cookie preferences</CookiePreferencesLink>{" "}
        panel before any of them load.
      </p>

      <h2>4. Third-party cookies</h2>
      <p>
        We do not run advertising or cross-site tracking. Where a workspace owner adds a third-party script (for
        example, web analytics or a chat widget) on their career site, the third party may set its own cookies
        under its own policy. We list the provider name in the consent banner so you can identify them.
      </p>

      <h2>5. How to manage your choices</h2>
      <p>
        You can change your choice any time using the <CookiePreferencesLink className="cookie-banner-link">
          Cookie preferences
        </CookiePreferencesLink>{" "}
        link in the footer. You can also clear cookies in your browser settings; we will then ask you again on
        your next visit. Many browsers offer a &ldquo;Do Not Track&rdquo; signal, which we treat as a request to
        keep functional and marketing categories off.
      </p>

      <h2>6. Retention</h2>
      <p>
        Session cookies disappear when you close your browser. Persistent cookies live for the period stated in
        the table above, or until you clear them. The consent record itself is kept for 12 months and is refreshed
        whenever you reopen and save preferences.
      </p>

      <h2>7. Changes to this policy</h2>
      <p>
        When we add new cookie categories or change how an existing category is used, we will republish this page
        and bump the consent version, which will prompt you to re-confirm your choices on your next visit.
      </p>

      <h2>8. Contact</h2>
      <p>
        Questions about cookies? Email <a href="mailto:hi@gordienok.com">hi@gordienok.com</a>.
      </p>
    </article>
  );
}
