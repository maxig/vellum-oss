// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Vellum",
  description:
    "How Vellum collects, uses, stores, and protects personal data, including data accessed through Google services.",
};

const EFFECTIVE = "May 28, 2026";

export default function PrivacyPage() {
  return (
    <article className="legal-article">
      <div className="section-h" style={{ marginBottom: 8 }}>Legal</div>
      <h1>
        Privacy <span className="serif" style={{ fontStyle: "italic", fontWeight: 400, color: "var(--accent-solid)" }}>policy.</span>
      </h1>
      <p className="lede">
        This Privacy Policy explains how Vellum (&ldquo;Vellum,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, shares, and
        protects information when you use our applicant tracking platform, our websites, and related services
        (collectively, the &ldquo;Service&rdquo;). It also describes the rights you have over your information.
      </p>
      <p className="tiny" style={{ marginTop: 6 }}>Effective date: {EFFECTIVE}</p>

      <h2>1. Who we are</h2>
      <p>
        Vellum provides an AI-first applicant tracking system used by employers (&ldquo;Customers&rdquo;) to manage hiring.
        Depending on the context, Vellum may act as a <b>data controller</b> (for our own websites, marketing, and
        accounts) or as a <b>data processor</b> on behalf of a Customer (for candidate data managed within their
        workspace). When Vellum acts as a processor, the Customer is responsible for the lawful basis of processing
        candidate data and for responding to candidate rights requests.
      </p>

      <h2>2. Information we collect</h2>
      <p>We collect information in the following ways:</p>
      <h3>2.1 Information you provide</h3>
      <ul>
        <li><b>Account data:</b> name, email address, password (hashed), profile picture, role, and workspace.</li>
        <li><b>Candidate data:</b> applications, CVs, cover letters, contact details, answers to screening questions, interview notes, feedback, and scorecards submitted to a workspace.</li>
        <li><b>Communications:</b> emails, messages, scheduling information, and support requests exchanged through the Service.</li>
        <li><b>Billing data:</b> company name, billing contact, and tax identifiers (payment card data is handled by our payment processor and is not stored by Vellum).</li>
      </ul>
      <h3>2.2 Information collected automatically</h3>
      <ul>
        <li><b>Usage data:</b> pages viewed, actions taken, timestamps, referring URLs, and feature interactions.</li>
        <li><b>Device and log data:</b> IP address, browser type, operating system, language, and crash reports.</li>
        <li><b>Cookies and similar technologies:</b> for authentication, preferences (such as theme and density), and analytics. You can control cookies through your browser.</li>
      </ul>
      <h3>2.3 Information from third parties</h3>
      <ul>
        <li><b>Single sign-on providers</b> (e.g., Google, Microsoft) provide your name, email, and profile picture when you sign in.</li>
        <li><b>Calendar providers</b> (Google Calendar, Microsoft Outlook, CalDAV) provide event metadata, availability, and the ability to create/update interview events at your direction.</li>
        <li><b>Background-check or assessment vendors</b>, if a Customer chooses to integrate them.</li>
      </ul>

      <h2>3. Google user data &amp; Google API services</h2>
      <p>
        When you connect a Google account to Vellum, we request only the scopes needed to provide the features you
        enable. Today this includes Google Calendar access used to read your availability and to create, update, and
        delete interview events on your calendar.
      </p>
      <p>
        Vellum&rsquo;s use and transfer of information received from Google APIs to any other app will adhere to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Specifically:
      </p>
      <ul>
        <li>We use Google user data only to provide and improve user-facing features (interview scheduling, calendar sync, conflict detection).</li>
        <li>We do not use Google user data to serve advertising, and we do not sell it.</li>
        <li>We do not allow humans to read Google user data, except (a) with your explicit consent, (b) for security investigations, (c) to comply with law, or (d) where data has been aggregated and anonymized.</li>
        <li>We do not transfer Google user data to third parties except as necessary to provide the Service, for security purposes, or to comply with law.</li>
        <li>You can revoke Vellum&rsquo;s access at any time from your{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">Google account permissions</a>{" "}
          page or by disconnecting the integration in Vellum&rsquo;s settings.
        </li>
      </ul>

      <h2>4. How we use information</h2>
      <ul>
        <li>To provide, secure, and operate the Service.</li>
        <li>To authenticate users and manage workspace membership.</li>
        <li>To schedule interviews, sync calendars, and send notifications you have opted into.</li>
        <li>To generate AI-assisted summaries, drafts, and recommendations, subject to the settings configured by the Customer.</li>
        <li>To analyze and improve features, fix bugs, and prevent abuse.</li>
        <li>To comply with legal obligations and enforce our Terms.</li>
      </ul>

      <h2>5. AI processing</h2>
      <p>
        Vellum integrates with model providers (such as Anthropic, OpenAI, Google, and self-hosted models) to power
        AI features. Customers control which provider is used, whether PII redaction is applied before content
        leaves the workspace, and whether &ldquo;no-log&rdquo; mode is enabled with the provider. AI outputs are
        suggestions only and do not constitute automated decisions about a candidate&rsquo;s employment.
      </p>

      <h2>6. Legal bases (EEA/UK)</h2>
      <ul>
        <li><b>Contract:</b> to provide the Service to you or your Customer.</li>
        <li><b>Legitimate interests:</b> to secure, maintain, and improve the Service.</li>
        <li><b>Consent:</b> for optional integrations, cookies that are not strictly necessary, and certain communications.</li>
        <li><b>Legal obligation:</b> to comply with applicable law.</li>
      </ul>

      <h2>7. How we share information</h2>
      <p>We share information only as needed and never sell it. Categories of recipients include:</p>
      <ul>
        <li><b>Customers and other authorized workspace members</b> for collaborating on hiring.</li>
        <li><b>Service providers</b> (hosting, error monitoring, email delivery, AI model providers, payment processors) bound by data-protection terms.</li>
        <li><b>Integrations you choose to enable</b>, such as Google Calendar, Microsoft 365, or third-party HRIS.</li>
        <li><b>Authorities</b> when required by law, regulation, or valid legal process.</li>
        <li><b>Successors</b> in connection with a merger, acquisition, or asset sale, with notice where required.</li>
      </ul>

      <h2>8. International transfers</h2>
      <p>
        Vellum may process information in countries other than your own. Where required, we rely on appropriate
        safeguards, including the European Commission&rsquo;s Standard Contractual Clauses, the UK International
        Data Transfer Addendum, or equivalent mechanisms.
      </p>

      <h2>9. Data retention</h2>
      <p>
        We retain personal data for as long as needed to provide the Service and for the periods Customers
        configure. Account and billing records are retained as required by law. Candidates may request deletion
        through the relevant Customer, or via{" "}
        <a href="mailto:hi@gordienok.com">hi@gordienok.com</a> if Vellum is the controller.
      </p>

      <h2>10. Security</h2>
      <p>
        We apply administrative, technical, and organizational measures designed to protect information against
        unauthorized access, alteration, disclosure, or destruction. These include encryption in transit, encrypted
        backups, role-based access controls, audit logging, and least-privilege engineering practices. No system is
        completely secure, and we cannot guarantee absolute security.
      </p>

      <h2>11. Your rights</h2>
      <p>
        Depending on your location, you may have the right to access, correct, delete, port, restrict, or object to
        the processing of your personal data, and to withdraw consent. To exercise these rights, contact{" "}
        <a href="mailto:hi@gordienok.com">hi@gordienok.com</a>. If your data is processed by Vellum on behalf of
        a Customer, we will route your request to that Customer. You also have the right to lodge a complaint with
        your local supervisory authority.
      </p>

      <h2>12. Children</h2>
      <p>
        The Service is not directed to children under 16, and we do not knowingly collect personal data from
        them. If you believe a child has provided us with personal data, please contact us so we can delete it.
      </p>

      <h2>13. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will post the updated version on this page and, if
        the changes are material, we will notify you through the Service or by email.
      </p>

      <h2>14. Contact us</h2>
      <p>
        For privacy questions, requests, or complaints, contact our team at{" "}
        <a href="mailto:hi@gordienok.com">hi@gordienok.com</a>.
      </p>
    </article>
  );
}
