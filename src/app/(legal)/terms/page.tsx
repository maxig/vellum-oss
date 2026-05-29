// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use — Vellum",
  description: "The terms that govern your use of Vellum's applicant tracking platform and related services.",
};

const EFFECTIVE = "May 28, 2026";

export default function TermsPage() {
  return (
    <article className="legal-article">
      <div className="section-h" style={{ marginBottom: 8 }}>Legal</div>
      <h1>
        Terms <span className="serif" style={{ fontStyle: "italic", fontWeight: 400, color: "var(--accent-solid)" }}>of use.</span>
      </h1>
      <p className="lede">
        These Terms of Use (the &ldquo;Terms&rdquo;) govern your access to and use of Vellum&rsquo;s applicant tracking
        platform, websites, and related services (the &ldquo;Service&rdquo;). By using the Service, you agree to these
        Terms. If you are using the Service on behalf of an organization, you confirm that you have the authority
        to bind that organization to these Terms.
      </p>
      <p className="tiny" style={{ marginTop: 6 }}>Effective date: {EFFECTIVE}</p>

      <h2>1. The Service</h2>
      <p>
        Vellum is an AI-first applicant tracking system. We provide tools to publish jobs, receive applications,
        manage candidate pipelines, schedule interviews, collaborate with hiring teams, and use AI-assisted
        features. The Service is offered both as a hosted product and as open-source software you may self-host.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You must provide accurate information when creating an account and keep it up to date.</li>
        <li>You are responsible for safeguarding your credentials and for all activity under your account.</li>
        <li>You must be at least 16 years old to use the Service.</li>
        <li>You agree to notify us promptly of any unauthorized access at <a href="mailto:security@vellum.app">security@vellum.app</a>.</li>
      </ul>

      <h2>3. Workspaces and roles</h2>
      <p>
        Vellum organizes work into workspaces. Workspace owners and admins control membership, integrations, and
        configuration. Members and external collaborators (such as interviewers and hiring managers) are bound by
        these Terms and by any policies set by the workspace owner. Owners are responsible for who they invite and
        what data they import.
      </p>

      <h2>4. Acceptable use</h2>
      <p>You agree that you will not, and will not allow others to:</p>
      <ul>
        <li>Use the Service to send spam, harass candidates, or engage in unlawful discrimination.</li>
        <li>Upload or process personal data without a lawful basis to do so.</li>
        <li>Attempt to access another workspace&rsquo;s data or to bypass authentication or authorization.</li>
        <li>Reverse engineer, decompile, or attempt to extract source code of the hosted Service, except where permitted by applicable law or the applicable open-source license.</li>
        <li>Use the Service to build a competing product by scraping or systematically extracting data.</li>
        <li>Probe, scan, or test the vulnerability of the Service without our written permission (good-faith security research is welcomed via <a href="mailto:security@vellum.app">security@vellum.app</a>).</li>
        <li>Use the Service to violate any applicable law, including data protection, employment, or anti-discrimination law.</li>
        <li>Make automated decisions about candidates based solely on AI output. AI features in Vellum produce suggestions for human review.</li>
      </ul>

      <h2>5. Candidate data and your responsibilities</h2>
      <p>
        If you use Vellum to process candidate data, you are the data controller of that data and you are
        responsible for:
      </p>
      <ul>
        <li>Having a lawful basis for the processing.</li>
        <li>Providing required notices to candidates and obtaining required consents.</li>
        <li>Responding to candidates&rsquo; data-protection rights requests.</li>
        <li>Configuring retention, access controls, and AI settings in line with your obligations.</li>
      </ul>
      <p>
        Where we act as a processor, our processing is governed by our Data Processing Addendum, which is
        incorporated by reference and is available on request.
      </p>

      <h2>6. AI features</h2>
      <p>
        Vellum&rsquo;s AI features summarize content, draft messages, suggest matches, and produce other
        recommendations. AI output may be inaccurate, incomplete, or biased. You must:
      </p>
      <ul>
        <li>Review AI output before relying on it for any consequential decision.</li>
        <li>Not use AI output as the sole basis for hiring, rejecting, or otherwise making decisions about candidates.</li>
        <li>Comply with applicable AI regulations (including the EU AI Act, where relevant) in your jurisdiction.</li>
      </ul>

      <h2>7. Third-party integrations</h2>
      <p>
        The Service may integrate with third-party products you choose to connect, such as Google Workspace,
        Microsoft 365, or background-check providers. Your use of those products is governed by their own terms.
        Vellum is not responsible for third-party services and may suspend an integration if the third party
        changes its terms or APIs.
      </p>

      <h2>8. Open-source software</h2>
      <p>
        Vellum&rsquo;s source code is made available under the license posted in our public repository. Your use
        of the source code is governed by that license. These Terms apply to your use of the hosted Service we
        operate.
      </p>

      <h2>9. Fees</h2>
      <p>
        Paid plans are billed in advance on a recurring basis. Fees are non-refundable except where required by
        law. If your payment fails, we may suspend the Service after notice. You are responsible for any
        applicable taxes.
      </p>

      <h2>10. Confidentiality</h2>
      <p>
        Each party agrees to protect the other&rsquo;s non-public business information disclosed in connection with
        the Service, to use it only to perform under these Terms, and to use reasonable care to prevent
        unauthorized disclosure.
      </p>

      <h2>11. Intellectual property</h2>
      <p>
        Vellum and its licensors own the Service, including all software, designs, and trademarks. You retain all
        rights in the content you submit to the Service (&ldquo;Customer Content&rdquo;) and grant Vellum the
        rights needed to host, operate, and improve the Service. Feedback you provide may be used by Vellum
        without restriction.
      </p>

      <h2>12. Suspension and termination</h2>
      <p>
        You may stop using the Service at any time. We may suspend or terminate your access if you breach these
        Terms, if your use creates a security or legal risk, or if we are required to do so by law. On
        termination, you may export your Customer Content for a reasonable period before it is deleted from our
        systems.
      </p>

      <h2>13. Disclaimers</h2>
      <p>
        The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. To the maximum
        extent permitted by law, Vellum disclaims all warranties, express or implied, including merchantability,
        fitness for a particular purpose, and non-infringement. We do not warrant that the Service will be
        uninterrupted, error-free, or that AI output will be accurate.
      </p>

      <h2>14. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, neither party will be liable for any indirect, incidental,
        special, consequential, exemplary, or punitive damages. Each party&rsquo;s aggregate liability arising
        out of or relating to these Terms will not exceed the greater of (a) the amounts paid by you to Vellum
        for the Service in the twelve months before the event giving rise to liability, or (b) one hundred US
        dollars (US$100).
      </p>

      <h2>15. Indemnification</h2>
      <p>
        You will defend, indemnify, and hold Vellum harmless from third-party claims arising from (a) your
        violation of these Terms or applicable law, (b) Customer Content you submit, or (c) your use of the
        Service in a way that infringes a third party&rsquo;s rights.
      </p>

      <h2>16. Changes to the Service or these Terms</h2>
      <p>
        We may update the Service and these Terms from time to time. If a change is material, we will give
        reasonable notice (for example, by email or in-product notice). Your continued use of the Service after
        the effective date of a change constitutes acceptance of the updated Terms.
      </p>

      <h2>17. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of the jurisdiction set out in your order form, or, if none, by the
        laws applicable to Vellum&rsquo;s principal place of business, without regard to conflict-of-law rules.
        The parties consent to the exclusive jurisdiction of the courts located there for any dispute arising out
        of or relating to these Terms.
      </p>

      <h2>18. Contact</h2>
      <p>
        Questions about these Terms? Email <a href="mailto:legal@vellum.app">legal@vellum.app</a>.
      </p>
    </article>
  );
}
