// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Glass, Chip, Icons, WorkspaceMark } from "@/components/primitives";
import RichText from "@/components/RichText";
import RolesBoard from "./RolesBoard";
import { fmtMoney } from "@/lib/utils";
import { recordCareerEvent } from "@/lib/career-events";
import CookieConsent, { CookiePreferencesLink } from "@/components/CookieConsent";
import CookieScripts from "@/components/CookieScripts";
import { normalizeCookieConfig } from "@/lib/cookies";

export const dynamic = "force-dynamic";

type CareerSiteContent = {
  brand: { name: string; domain: string };
  hero: {
    eyebrow: string;
    headline_1: string;
    headline_2: string;
    lede: string;
    cta_primary: string;
    cta_secondary: string;
  };
  about: {
    eyebrow: string;
    headline: string;
    body_1: string;
    body_2: string;
    stats: { n: string; l: string }[];
  };
  values: { t: string; b: string }[];
  offices: { city: string; country: string; address: string; employees: string }[];
  stories: { name: string; role: string; years: string; quote: string; photoUrl: string }[];
  cta: { headline: string; body: string; button_1: string; button_2: string };
  footer: { email: string; company: string };
};

function defaultCareerSite(ws: { name: string; domain: string }, openRoles: number): CareerSiteContent {
  return {
    brand: { name: ws.name, domain: `careers.${ws.domain}` },
    hero: {
      eyebrow: `We're hiring across {n} role${openRoles === 1 ? "" : "s"}`,
      headline_1: "Help us make lending",
      headline_2: "feel obvious.",
      lede: `<p>${ws.name} is a small, kind team working with banks across Europe to make credit decisions faster, fairer, and easier to understand.</p>`,
      cta_primary: "See open roles",
      cta_secondary: "Meet the team",
    },
    about: {
      eyebrow: `About ${ws.name}`,
      headline: "We build the decisioning layer underneath modern banks.",
      body_1:
        "<p>We power the credit decisions behind some of Europe's most innovative banks, all tailored to the person on the other end of the screen.</p>",
      body_2:
        "<p>The team is small, thoughtful, and not in a rush. We care about <b>craft</b>, <b>clarity</b>, and software that explains itself.</p>",
      stats: [
        { n: "38", l: "people" },
        { n: "11", l: "countries" },
        { n: "140k+", l: "offers/day" },
        { n: "$24M", l: "Series A" },
      ],
    },
    values: [
      { t: "Explainable by default", b: "Every decision our software makes can be understood. We hold ourselves to the same standard." },
      { t: "Small team, big trust", b: "We hire slowly and give people room. You'll own things end-to-end." },
      { t: "Kind in feedback", b: "Direct, specific, and on the work, never the person. We protect this." },
      { t: "Built in public-ish", b: "We share our roadmap with customers and our craft with peers. Pull requests welcome." },
    ],
    offices: [
      { city: "Berlin", country: "Germany", address: "Torstraße 161", employees: "22" },
      { city: "Lisbon", country: "Portugal", address: "Av. da Liberdade 110", employees: "9" },
      { city: "Remote", country: "EU/UK", address: "Across 7 timezones", employees: "7" },
    ],
    stories: [
      {
        name: "Lina",
        role: "Sr. Engineer",
        years: "2 yrs at " + ws.name.toLowerCase(),
        quote: "<p>I joined to build the credit engine. I stayed because <i>nobody here treats lending like a black box.</i></p>",
        photoUrl: "",
      },
      {
        name: "Adeel",
        role: "Product",
        years: "1.5 yrs at " + ws.name.toLowerCase(),
        quote: "<p>We ship to real banks. The feedback loop is short, the work is hard, and the team is genuinely kind.</p>",
        photoUrl: "",
      },
      {
        name: "Esme",
        role: "Design",
        years: "8 mo at " + ws.name.toLowerCase(),
        quote: "<p>Fintech doesn't have to look like fintech. We get to invent the visual language as we go.</p>",
        photoUrl: "",
      },
    ],
    cta: {
      headline: "Don't see your role?",
      body: "<p>Tell us what you'd want to work on. We read everything that comes in.</p>",
      button_1: "Send us a note",
      button_2: "Read our handbook",
    },
    footer: { email: `careers@${ws.domain}`, company: `© ${ws.name}` },
  };
}

function mergeCareerSite(defaults: CareerSiteContent, saved: any): CareerSiteContent {
  return {
    brand: { ...defaults.brand, ...(saved?.brand || {}) },
    hero: { ...defaults.hero, ...(saved?.hero || {}) },
    about: { ...defaults.about, ...(saved?.about || {}) },
    values: Array.isArray(saved?.values) && saved.values.length ? saved.values : defaults.values,
    offices: Array.isArray(saved?.offices) && saved.offices.length ? saved.offices : defaults.offices,
    stories: Array.isArray(saved?.stories) && saved.stories.length ? saved.stories : defaults.stories,
    cta: { ...defaults.cta, ...(saved?.cta || {}) },
    footer: { ...defaults.footer, ...(saved?.footer || {}) },
  };
}

function money(min: number | null, max: number | null, currency: string | null) {
  return fmtMoney(min, max, currency || "EUR");
}

export default async function CareersHome({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace: slug } = await params;
  const ws = await db.workspace.findUnique({
    where: { slug },
    include: {
      careerSite: true,
      jobs: { where: { status: "Open" }, orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }] },
    },
  });
  if (!ws) notFound();

  // Career-site landing analytics — counts every distinct anon session
  // hitting the index. Fire-and-forget; the recorder swallows its own
  // errors so a bad write can never break the public site render.
  await recordCareerEvent({
    workspaceId: ws.id,
    kind: "page_view",
    jobId: null,
    path: `/careers/${slug}`,
  });

  const site = mergeCareerSite(defaultCareerSite(ws, ws.jobs.length), ws.careerSite);
  const eyebrow = site.hero.eyebrow.replace("{n}", String(ws.jobs.length));
  const departments = Array.from(new Set(ws.jobs.map((j) => j.department).filter((x): x is string => !!x)));
  const cookieConfig = normalizeCookieConfig((ws as { cookieConfig?: unknown }).cookieConfig);

  return (
    <>
      <div style={{ position: "relative", padding: "12px 24px 0" }}>
        <Glass className="career-nav glass-strong">
          <a href="/" className="row" style={{ gap: 10 }}>
            <WorkspaceMark workspace={{ name: ws.name, color: ws.color }} size={28} />
            <span className="gs-name">{site.brand.name}</span>
          </a>
          <div style={{ flex: 1 }} />
          <a className="tiny career-nav-extra" href="#about" style={{ color: "var(--ink-1)", fontSize: 13 }}>About</a>
          <a className="tiny career-nav-extra" href="#offices" style={{ color: "var(--ink-1)", fontSize: 13 }}>Offices</a>
          <a className="tiny career-nav-extra" href="#stories" style={{ color: "var(--ink-1)", fontSize: 13 }}>Stories</a>
          <a className="tiny" href="#roles" style={{ color: "var(--ink-0)", fontSize: 13, fontWeight: 500 }}>Careers</a>
          <a className="btn btn-sm btn-primary career-nav-extra" href={`mailto:${site.footer.email}`}>Talk to us</a>
        </Glass>
      </div>

      <section className="career-hero">
        {eyebrow && (
          <div className="row" style={{ justifyContent: "center", marginBottom: 18 }}>
            <span className="chip" style={{ height: 26, padding: "0 12px", fontSize: 12 }}>
              <span className="chip-dot" style={{ background: "oklch(68% 0.16 150)" }} />
              {eyebrow}
            </span>
          </div>
        )}
        <h1>
          {site.hero.headline_1}
          <br />
          <span className="serif" style={{ fontStyle: "italic", fontWeight: 400, color: "var(--accent-solid)" }}>
            {site.hero.headline_2}
          </span>
        </h1>
        <RichText html={site.hero.lede} className="lede" />
        <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 30, flexWrap: "wrap" }}>
          <a href="#roles" className="btn btn-lg btn-primary">
            {site.hero.cta_primary} <Icons.ArrowRight size={14} stroke={2} />
          </a>
          <a href="#about" className="btn btn-lg">{site.hero.cta_secondary}</a>
        </div>

        <div style={{ marginTop: 56, position: "relative" }}>
          <div className="career-photo-grid">
            <div className="imgph" style={{ height: 220, gridColumn: "span 4" }}>team / berlin offsite</div>
            <div
              className="imgph"
              style={{
                height: 220,
                gridColumn: "span 5",
                background:
                  "linear-gradient(135deg, color-mix(in oklab, var(--accent-1) 25%, var(--bg-1)), color-mix(in oklab, var(--accent-2) 25%, var(--bg-1)))",
              }}
            >
              team / engineering pair
            </div>
            <div className="imgph" style={{ height: 220, gridColumn: "span 3" }}>office / berlin</div>
          </div>
        </div>
      </section>

      <section id="about" className="career-section" style={{ marginTop: 60 }}>
        <div className="career-about-grid">
          <div>
            <div className="section-h" style={{ marginBottom: 8 }}>{site.about.eyebrow}</div>
            <h2 style={{ fontSize: 38, lineHeight: 1.05, letterSpacing: "-0.03em" }}>{site.about.headline}</h2>
          </div>
          <div className="col" style={{ gap: 16, fontSize: 16, lineHeight: 1.6, color: "var(--ink-1)" }}>
            {site.about.body_1 && <RichText html={site.about.body_1} />}
            {site.about.body_2 && <RichText html={site.about.body_2} />}
            {!!site.about.stats?.length && (
              <div className="row" style={{ gap: 16, marginTop: 8, flexWrap: "wrap" }}>
                {site.about.stats.map((s, i) => (
                  <div key={`${s.n}-${i}`} style={{ minWidth: 92 }}>
                    <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink-0)" }}>{s.n}</div>
                    <div className="tiny">{s.l}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {site.offices.length > 0 && (
        <section id="offices" className="career-section">
          <div className="section-h" style={{ marginBottom: 6 }}>Where we are</div>
          <h2 style={{ fontSize: 30, marginBottom: 22 }}>Our offices.</h2>
          <div className="career-offices-grid">
            {site.offices.map((o, i) => (
              <Glass key={`${o.city}-${i}`} faint style={{ padding: 22, borderRadius: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="row" style={{ alignItems: "baseline" }}>
                  <h3 style={{ flex: 1, fontSize: 20, letterSpacing: "-0.01em" }}>{o.city || "—"}</h3>
                  {o.employees && <Chip>{o.employees} people</Chip>}
                </div>
                {o.country && <div className="tiny" style={{ color: "var(--ink-1)" }}>{o.country}</div>}
                {o.address && (
                  <div className="row" style={{ gap: 6 }}>
                    <Icons.MapPin size={12} stroke={1.8} style={{ color: "var(--ink-2)" }} />
                    <span className="tiny">{o.address}</span>
                  </div>
                )}
              </Glass>
            ))}
          </div>
        </section>
      )}

      <section id="roles" className="career-section">
        <div className="row" style={{ marginBottom: 22, alignItems: "baseline" }}>
          <div style={{ flex: 1 }}>
            <div className="section-h" style={{ marginBottom: 6 }}>Open roles</div>
            <h2 style={{ fontSize: 30 }}>Come work with us.</h2>
          </div>
        </div>

        <RolesBoard
          departments={departments}
          offices={site.offices.map((o) => ({ city: o.city, country: o.country }))}
          jobs={ws.jobs.map((j) => ({
            id: j.id,
            slug: j.slug,
            title: j.title,
            department: j.department,
            location: j.location,
            employment: j.employment,
            // The workspace currency is the source of truth — use it for every
            // listing so a recruiter switching EUR → USD in settings flips
            // every published role at once instead of leaving old jobs stuck
            // on whatever currency was active at create time.
            salary: j.salaryDisplay || money(j.salaryMin, j.salaryMax, ws.currency || j.salaryCurrency),
          }))}
        />
      </section>

      {site.stories.length > 0 && (
        <section id="stories" className="career-section">
          <div className="section-h" style={{ marginBottom: 6 }}>Stories</div>
          <h2 style={{ fontSize: 30, marginBottom: 22 }}>The people, in their own words.</h2>
          <div className="career-story-grid">
            {site.stories.map((story, i) => {
              const photo = story.photoUrl?.trim();
              const isUrl = photo && (photo.startsWith("http") || photo.startsWith("/"));
              return (
                <Glass key={`${story.name}-${i}`} style={{ padding: 22, borderRadius: 18, display: "flex", flexDirection: "column", gap: 16 }}>
                  {isUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo}
                      alt={story.name || "Team member"}
                      style={{ width: "100%", height: 180, objectFit: "cover", borderRadius: 12 }}
                    />
                  ) : (
                    <div
                      className="imgph"
                      style={{
                        height: 180,
                        borderRadius: 12,
                        background: `linear-gradient(135deg, color-mix(in oklab, var(--accent-${(i % 2) + 1}) 30%, var(--bg-1)), color-mix(in oklab, var(--accent-${((i + 1) % 2) + 1}) 25%, var(--bg-1)))`,
                      }}
                    >
                      portrait / {(story.name || "team").toLowerCase()}
                    </div>
                  )}
                  <blockquote className="serif" style={{ fontSize: 19, lineHeight: 1.35, margin: 0, letterSpacing: "-0.01em" }}>
                    <RichText html={story.quote} fallback={<em className="muted">No quote yet.</em>} />
                  </blockquote>
                  <div style={{ marginTop: "auto" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{story.name}{story.role ? `, ${story.role}` : ""}</div>
                    {story.years && <div className="tiny">{story.years}</div>}
                  </div>
                </Glass>
              );
            })}
          </div>
        </section>
      )}

      {!!site.values.length && (
        <section className="career-section">
          <div className="section-h" style={{ marginBottom: 6 }}>How we work</div>
          <h2 style={{ fontSize: 30, marginBottom: 22 }}>A few things we mean.</h2>
          <div className="career-values-grid">
            {site.values.map((value, i) => (
              <Glass key={`${value.t}-${i}`} faint style={{ padding: 20, borderRadius: 14 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))",
                    opacity: 0.9,
                    marginBottom: 14,
                  }}
                />
                <h3 style={{ fontSize: 15, marginBottom: 6, letterSpacing: "-0.015em" }}>{value.t}</h3>
                <p className="tiny" style={{ fontSize: 13, color: "var(--ink-1)", lineHeight: 1.5 }}>{value.b}</p>
              </Glass>
            ))}
          </div>
        </section>
      )}

      {site.cta.headline && (
        <section className="career-section">
          <Glass style={{ padding: 50, borderRadius: 28, textAlign: "center", position: "relative", overflow: "hidden" }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(circle at 30% 0%, color-mix(in oklab, var(--accent-1) 18%, transparent), transparent 60%), radial-gradient(circle at 80% 100%, color-mix(in oklab, var(--accent-2) 18%, transparent), transparent 60%)",
                pointerEvents: "none",
              }}
            />
            <div style={{ position: "relative" }}>
              <h2 style={{ fontSize: 44, letterSpacing: "-0.03em", lineHeight: 1.05, marginBottom: 16 }}>{site.cta.headline}</h2>
              <RichText html={site.cta.body} style={{ fontSize: 17, color: "var(--ink-1)", maxWidth: 480, margin: "0 auto 26px", lineHeight: 1.5 }} />
              <div className="row" style={{ justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                {site.cta.button_1 && (
                  <a href={`mailto:${site.footer.email}`} className="btn btn-lg btn-primary">
                    {site.cta.button_1} <Icons.Send size={13} stroke={2} />
                  </a>
                )}
                {site.cta.button_2 && <a href="#about" className="btn btn-lg">{site.cta.button_2}</a>}
              </div>
            </div>
          </Glass>
        </section>
      )}

      <footer className="career-footer">
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div className="row" style={{ gap: 10, marginBottom: 12 }}>
              <WorkspaceMark workspace={{ name: ws.name, color: ws.color }} size={22} />
              <span className="gs-name" style={{ fontSize: 14 }}>{site.brand.name}</span>
            </div>
            <div className="tiny">{site.footer.company}</div>
          </div>
          <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
            <a className="tiny" href="/privacy">Privacy</a>
            <a className="tiny" href="/cookies">Cookies</a>
            <a className="tiny" href="/terms">Terms</a>
            <CookiePreferencesLink />
            <a className="tiny" href={`mailto:${site.footer.email}`}>{site.footer.email}</a>
          </div>
        </div>
      </footer>

      {cookieConfig.enabled && (
        <>
          <CookieConsent title={cookieConfig.banner?.title} message={cookieConfig.banner?.message} />
          <CookieScripts scripts={cookieConfig.scripts} />
        </>
      )}
    </>
  );
}
