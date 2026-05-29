// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import ThemeBoot from "@/components/ThemeBoot";
import { Glass, Chip } from "@/components/primitives";
import { Icons } from "@/components/Icons";
import CookieConsent, { CookiePreferencesLink } from "@/components/CookieConsent";

export const dynamic = "force-dynamic";

export default async function Root() {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");
  const count = await db.user.count();
  if (count === 0) redirect("/onboarding");

  return (
    <>
      <ThemeBoot prefs={{ theme: "light", density: "cozy", accent: "indigo", glassIntensity: 1.0 }} />
      <div className="ambient"><div className="blob" /></div>

      <div className="marketing-shell scroll-y">
        <div style={{ position: "relative", padding: "12px 24px 0" }}>
          <Glass className="marketing-nav glass-strong">
            <Link href="/" className="row" style={{ gap: 10 }}>
              <span className="gs-mark" />
              <span className="gs-name">Vellum</span>
            </Link>
            <div style={{ flex: 1 }} />
            <a className="tiny marketing-nav-extra" href="#features" style={{ color: "var(--ink-1)", fontSize: 13 }}>Features</a>
            <a className="tiny marketing-nav-extra" href="#ai" style={{ color: "var(--ink-1)", fontSize: 13 }}>AI</a>
            <a className="tiny marketing-nav-extra" href="#self-host" style={{ color: "var(--ink-1)", fontSize: 13 }}>Self-host</a>
            <a className="tiny marketing-nav-extra" href="https://github.com/vellum-ats/vellum" target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink-1)", fontSize: 13 }}>GitHub</a>
            <Link href="/login" className="btn btn-sm">Sign in</Link>
            <Link href="/onboarding" className="btn btn-sm btn-primary">Start free</Link>
          </Glass>
        </div>

        <section className="marketing-hero">
          <div className="row" style={{ justifyContent: "center", marginBottom: 18 }}>
            <span className="chip" style={{ height: 26, padding: "0 12px", fontSize: 12 }}>
              <span className="chip-dot" style={{ background: "oklch(68% 0.16 150)" }} />
              Open source · AGPL · Self-hosted
            </span>
          </div>
          <h1>
            Hiring software that
            <br />
            <span className="serif" style={{ fontStyle: "italic", fontWeight: 400, color: "var(--accent-solid)" }}>
              feels obvious.
            </span>
          </h1>
          <p className="lede">
            Vellum is an AI-first applicant tracking system for teams who want a beautiful pipeline, calm
            collaboration, and a candidate experience that doesn&rsquo;t feel like a form.
          </p>
          <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 30, flexWrap: "wrap" }}>
            <Link href="/onboarding" className="btn btn-lg btn-primary">
              Start free <Icons.ArrowRight size={14} stroke={2} />
            </Link>
            <a href="#features" className="btn btn-lg">See how it works</a>
          </div>
          <div className="tiny" style={{ marginTop: 14, color: "var(--ink-2)" }}>
            <code className="mono" style={{ fontSize: 12.5 }}>docker compose up</code>
            <span> and you have a working ATS at </span>
            <code className="mono" style={{ fontSize: 12.5 }}>localhost:3000</code>.
          </div>
        </section>

        <section className="marketing-section">
          <Glass className="marketing-showcase">
            <div className="marketing-showcase-bar">
              <span className="marketing-dot" style={{ background: "#FF6058" }} />
              <span className="marketing-dot" style={{ background: "#FFBD2E" }} />
              <span className="marketing-dot" style={{ background: "#28C941" }} />
              <span className="tiny" style={{ marginLeft: 10, color: "var(--ink-2)" }}>
                acme.vellum.app / pipeline
              </span>
            </div>
            <div className="marketing-showcase-body">
              <div className="marketing-kanban">
                {[
                  { stage: "Applied", count: 24, accent: false, cards: [
                    { name: "Ines Vidal", role: "Senior Engineer", score: 86 },
                    { name: "Tomás Brito", role: "Senior Engineer", score: 74 },
                    { name: "Kira Ahmed", role: "Senior Engineer", score: 69 },
                  ] },
                  { stage: "Screen", count: 9, accent: false, cards: [
                    { name: "Daniel Ek", role: "Senior Engineer", score: 91 },
                    { name: "Yuki Tanaka", role: "Senior Engineer", score: 82 },
                  ] },
                  { stage: "Interview", count: 5, accent: true, cards: [
                    { name: "Marta Nowak", role: "Senior Engineer", score: 88 },
                    { name: "Ben Cohen", role: "Senior Engineer", score: 79 },
                  ] },
                  { stage: "Offer", count: 2, accent: false, cards: [
                    { name: "Lena Park", role: "Senior Engineer", score: 94 },
                  ] },
                ].map((col) => (
                  <div key={col.stage} className="marketing-kanban-col">
                    <div className="row" style={{ marginBottom: 10, alignItems: "center" }}>
                      <span className="tiny" style={{ fontWeight: 600, color: "var(--ink-0)", letterSpacing: 0 }}>{col.stage}</span>
                      <span className="tiny" style={{ marginLeft: 6, color: "var(--ink-2)" }}>{col.count}</span>
                      <div style={{ flex: 1 }} />
                      {col.accent && (
                        <span className="chip chip-accent" style={{ height: 18, padding: "0 6px", fontSize: 10 }}>AI nudge</span>
                      )}
                    </div>
                    <div className="col" style={{ gap: 8 }}>
                      {col.cards.map((c, i) => (
                        <Glass key={`${c.name}-${i}`} faint className="marketing-card">
                          <div className="row" style={{ alignItems: "center", gap: 8 }}>
                            <span className="marketing-avatar">
                              {c.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {c.name}
                              </div>
                              <div className="tiny" style={{ fontSize: 10.5 }}>{c.role}</div>
                            </div>
                            <span className="marketing-score">{c.score}</span>
                          </div>
                        </Glass>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Glass>
        </section>

        <section id="features" className="marketing-section">
          <div className="section-h" style={{ marginBottom: 6, textAlign: "center" }}>What&rsquo;s inside</div>
          <h2 style={{ fontSize: 36, textAlign: "center", letterSpacing: "-0.03em", marginBottom: 12 }}>
            Everything a hiring team needs.{" "}
            <span className="serif" style={{ fontStyle: "italic", fontWeight: 400, color: "var(--ink-2)" }}>Nothing it doesn&rsquo;t.</span>
          </h2>
          <p className="lede" style={{ textAlign: "center", maxWidth: 540, margin: "0 auto" }}>
            One workspace for jobs, candidates, conversations, and decisions — built for small teams that ship and
            large teams that care about craft.
          </p>

          <div className="marketing-features">
            {[
              { icon: Icons.Pipeline, title: "Kanban pipeline", body: "Drag candidates through stages, with WIP limits, sub-pipelines per role, and history baked in." },
              { icon: Icons.Sparkle, title: "AI evaluation", body: "Summaries, fit scores, and interview recaps. Always labeled, always reviewable, never auto-deciding." },
              { icon: Icons.Globe, title: "Branded career sites", body: "SEO-ready job listings on your domain with CNAME, JSON-LD, and a no-code editor." },
              { icon: Icons.Inbox, title: "Unified inbox", body: "Email, scheduling, and team comments in one thread. Context follows the candidate." },
              { icon: Icons.Calendar, title: "Calendar sync", body: "Two-way sync with Google, Microsoft, and CalDAV. Availability, holds, and conflict checks." },
              { icon: Icons.Lock, title: "Built for privacy", body: "Row-level workspace isolation, PII redaction before AI calls, full audit log, GDPR-ready exports." },
            ].map((f) => (
              <Glass key={f.title} faint className="marketing-feature">
                <div className="marketing-feature-icon">
                  <f.icon size={16} stroke={1.8} />
                </div>
                <h3 style={{ fontSize: 15.5, letterSpacing: "-0.015em", marginBottom: 6 }}>{f.title}</h3>
                <p className="tiny" style={{ fontSize: 13, color: "var(--ink-1)", lineHeight: 1.55 }}>{f.body}</p>
              </Glass>
            ))}
          </div>
        </section>

        <section id="ai" className="marketing-section">
          <Glass className="marketing-ai">
            <div className="marketing-ai-glow" />
            <div className="marketing-ai-grid">
              <div>
                <div className="section-h" style={{ marginBottom: 8 }}>AI, with the brakes on</div>
                <h2 style={{ fontSize: 34, letterSpacing: "-0.03em", lineHeight: 1.08, marginBottom: 14 }}>
                  Helpful in the loop.{" "}
                  <span className="serif" style={{ fontStyle: "italic", fontWeight: 400, color: "var(--accent-solid)" }}>
                    Never out of it.
                  </span>
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.55, color: "var(--ink-1)", marginBottom: 20 }}>
                  Vellum drafts, summarizes, and suggests — humans accept, edit, or ignore. No auto-rejects, no
                  silent decisions, no hidden prompts.
                </p>
                <ul className="marketing-ai-list">
                  {[
                    "Choose your provider — Anthropic, OpenAI, Google, or local Ollama.",
                    "PII redaction before content leaves your workspace.",
                    "Per-feature token budgets and usage reporting.",
                    "Response caching keyed by workspace + model + prompt.",
                    "Every AI-generated surface is clearly labeled.",
                  ].map((line) => (
                    <li key={line} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                      <span className="marketing-check"><Icons.Check size={11} stroke={2.4} /></span>
                      <span style={{ fontSize: 14, color: "var(--ink-1)" }}>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Glass strong className="marketing-ai-card">
                <div className="row" style={{ alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <span className="marketing-feature-icon" style={{ width: 28, height: 28 }}>
                    <Icons.Sparkle size={14} stroke={1.8} />
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-0)" }}>Interview recap</div>
                    <div className="tiny">Marta Nowak · Senior Engineer · 47 min</div>
                  </div>
                  <Chip accent>AI draft</Chip>
                </div>
                <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-1)", marginBottom: 12 }}>
                  Strong systems instinct — walked through the migration plan with clear failure modes. Pushed
                  back politely on a leading question, which is a good sign. Slightly nervous in the first 10
                  minutes, settled in once we moved to code.
                </p>
                <div className="row" style={{ gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                  <Chip good>Strong technical signal</Chip>
                  <Chip>Collaborative</Chip>
                  <Chip>Comp expectation: in range</Chip>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn btn-sm" disabled>Edit</button>
                  <button type="button" className="btn btn-sm btn-primary" disabled>Send to team</button>
                </div>
              </Glass>
            </div>
          </Glass>
        </section>

        <section id="self-host" className="marketing-section">
          <div className="marketing-self">
            <div>
              <div className="section-h" style={{ marginBottom: 8 }}>Self-host in minutes</div>
              <h2 style={{ fontSize: 32, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 14 }}>
                Your data,{" "}
                <span className="serif" style={{ fontStyle: "italic", fontWeight: 400, color: "var(--accent-solid)" }}>your servers.</span>
              </h2>
              <p style={{ fontSize: 16, lineHeight: 1.55, color: "var(--ink-1)", marginBottom: 18 }}>
                Vellum is open source under AGPL. Run it on a $5 VPS, your enterprise k8s cluster, or anything in
                between. Bring your own SSO, your own AI keys, your own retention policy.
              </p>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <a href="https://github.com/vellum-ats/vellum" target="_blank" rel="noopener noreferrer" className="btn">
                  <Icons.Github size={14} stroke={1.8} /> View on GitHub
                </a>
                <a href="https://github.com/vellum-ats/vellum#readme" target="_blank" rel="noopener noreferrer" className="btn">
                  Read the docs <Icons.ArrowUpRight size={12} stroke={1.8} />
                </a>
              </div>
            </div>

            <Glass strong className="marketing-code">
              <div className="marketing-code-bar">
                <span className="tiny" style={{ color: "var(--ink-2)" }}>terminal</span>
              </div>
              <pre className="marketing-code-body mono">
                <span className="marketing-code-comment"># 1. Clone and start</span>
                {"\n"}<span className="marketing-code-prompt">$</span> git clone https://github.com/vellum-ats/vellum
                {"\n"}<span className="marketing-code-prompt">$</span> cd vellum
                {"\n"}<span className="marketing-code-prompt">$</span> docker compose up -d
                {"\n"}
                {"\n"}<span className="marketing-code-comment"># 2. Create your workspace</span>
                {"\n"}<span className="marketing-code-prompt">$</span> open http://localhost:3000
                {"\n"}
                {"\n"}<span className="marketing-code-ok">✓</span> Ready in 12s
              </pre>
            </Glass>
          </div>
        </section>

        <section className="marketing-section">
          <Glass className="marketing-cta">
            <div className="marketing-cta-glow" />
            <div style={{ position: "relative", textAlign: "center" }}>
              <h2 style={{ fontSize: 44, letterSpacing: "-0.03em", lineHeight: 1.05, marginBottom: 14 }}>
                Run your first interview{" "}
                <span className="serif" style={{ fontStyle: "italic", fontWeight: 400, color: "var(--accent-solid)" }}>
                  this afternoon.
                </span>
              </h2>
              <p style={{ fontSize: 17, color: "var(--ink-1)", maxWidth: 520, margin: "0 auto 24px", lineHeight: 1.5 }}>
                Spin up a workspace, import a job, and invite your team. No credit card, no demo call.
              </p>
              <div className="row" style={{ justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                <Link href="/onboarding" className="btn btn-lg btn-primary">
                  Start free <Icons.ArrowRight size={13} stroke={2} />
                </Link>
                <Link href="/login" className="btn btn-lg">I already have an account</Link>
              </div>
            </div>
          </Glass>
        </section>

        <footer className="marketing-footer">
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 10, marginBottom: 12 }}>
                <span className="gs-mark" />
                <span className="gs-name" style={{ fontSize: 14 }}>Vellum</span>
              </div>
              <div className="tiny">© {new Date().getFullYear()} Vellum. AI-first applicant tracking.</div>
            </div>
            <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
              <Link className="tiny" href="/privacy">Privacy</Link>
              <Link className="tiny" href="/terms">Terms</Link>
              <Link className="tiny" href="/cookies">Cookies</Link>
              <CookiePreferencesLink />
              <a className="tiny" href="https://github.com/vellum-ats/vellum" target="_blank" rel="noopener noreferrer">GitHub</a>
              <a className="tiny" href="mailto:hello@vellum.app">hello@vellum.app</a>
            </div>
          </div>
        </footer>
      </div>
      <CookieConsent />
    </>
  );
}
