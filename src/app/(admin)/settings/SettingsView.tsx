// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE, LOCALES, LOCALE_LABELS, isLocale, type Locale } from "@/i18n/config";
import { Glass, Chip, AIPill, Icons, WorkspaceMark } from "@/components/primitives";
import { ACCENTS, AI_PROVIDERS, AI_FEATURES } from "@/lib/design";
import { applyPrefs } from "@/components/ThemeBoot";
import Wysiwyg from "@/components/Wysiwyg";
import InterviewKitsTab from "./InterviewKitsTab";
import {
  CATEGORY_ORDER,
  type CookieCategory,
  type CookieConfig,
  type CookieScript,
} from "@/lib/cookies";

type Tab =
  | "workspace"
  | "career"
  | "team"
  | "ai"
  | "interviewKits"
  | "email"
  | "calendar"
  | "appearance"
  | "cookies"
  | "danger";

const TABS: { id: Tab; icon: keyof typeof Icons }[] = [
  { id: "workspace",     icon: "Settings" },
  { id: "appearance",    icon: "Sun" },
  { id: "career",        icon: "Globe" },
  { id: "ai",            icon: "Sparkle" },
  { id: "team",          icon: "Users" },
  { id: "interviewKits", icon: "Star" },
  { id: "email",         icon: "Mail" },
  { id: "calendar",      icon: "Calendar" },
  { id: "cookies",       icon: "Lock" },
  { id: "danger",        icon: "Trash" },
];

type Role = "owner" | "admin" | "member";

// Minimum workspace role that may open each settings tab. Mirrors the
// capability matrix in ROLES.md §5 — keep the two in sync. "member" means
// every workspace member: Appearance is purely personal preference, and
// Calendar exposes a per-user "connect my calendar" panel that members
// legitimately need (the workspace-level pieces inside it are gated
// separately). Every other tab configures the workspace itself, so it's
// admin/owner-only. The owner-only action — delete workspace — lives inside
// the Danger tab and is gated on its own, below.
const TAB_MIN_ROLE: Record<Tab, Role> = {
  workspace:     "admin",
  appearance:    "member",
  career:        "admin",
  ai:            "admin",
  team:          "admin",
  interviewKits: "admin",
  email:         "admin",
  calendar:      "member",
  cookies:       "admin",
  danger:        "admin",
};

const ROLE_RANK: Record<Role, number> = { member: 0, admin: 1, owner: 2 };
function roleAtLeast(role: string, min: Role): boolean {
  return (ROLE_RANK[role as Role] ?? 0) >= ROLE_RANK[min];
}

export default function SettingsView(props: {
  tab: string;
  workspace: {
    id: string;
    slug: string;
    name: string;
    domain: string;
    color: string;
    industry: string | null;
    size: string | null;
    currency: string;
    departments: string[];
    timezone: string;
    locale: string;
    signature: string;
    defaults: Record<string, boolean>;
    cookieConfig: CookieConfig;
  };
  currentUser: { id: string; name: string | null; email: string; role: string; theme: string; density: string; accent: string; glassIntensity: number; locale: string | null };
  careerSite: any;
  ai: any;
  email: any;
  members: { id: string; role: string; user: { id: string; name: string | null; email: string } }[];
  invites: { id: string; email: string; role: string; token: string; expiresAt: string }[];
  publicDomain: string;
  publicScheme: string;
}) {
  const t = useTranslations("settings");
  const role = props.currentUser.role;
  // Only surface tabs this role can actually use, and never render a tab's
  // contents just because it was requested via ?tab=<x> — fall back to the
  // first tab the user is allowed to see.
  const visibleTabs = TABS.filter((tb) => roleAtLeast(role, TAB_MIN_ROLE[tb.id]));
  const requested = TABS.find((tb) => tb.id === props.tab)?.id;
  const tab = ((requested && roleAtLeast(role, TAB_MIN_ROLE[requested]) ? requested : visibleTabs[0]?.id) || "appearance") as Tab;
  const inviteLinkBase = `${props.publicScheme}://${props.publicDomain}/invite/`;

  return (
    <div className="page settings-page">
      <div className="settings-shell">
        <nav className="settings-nav">
          <div className="section-h" style={{ padding: "6px 10px", marginBottom: 8 }}>{t("title")}</div>
          {visibleTabs.map((tb) => {
            const I = Icons[tb.icon];
            return (
              <Link key={tb.id} href={`/settings?tab=${tb.id}`} className={`nav-item ${tab === tb.id ? "active" : ""}`}>
                <I size={15} className="nav-icon" />
                <span>{t(`tabs.${tb.id}`)}</span>
              </Link>
            );
          })}

          <Glass faint style={{ padding: 12, borderRadius: 10, marginTop: 18 }}>
            <div className="row" style={{ gap: 6, marginBottom: 6 }}>
              <Icons.Github size={12} style={{ color: "var(--ink-2)" }} />
              <span className="tiny" style={{ fontWeight: 500 }}>{t("openSource.title")}</span>
            </div>
            <div className="tiny" style={{ lineHeight: 1.45 }}>
              {t("openSource.body")}
            </div>
          </Glass>
        </nav>

        <div className="col" style={{ gap: 14, minWidth: 0 }}>
          {tab === "workspace"  && <WorkspaceTab {...props} />}
          {tab === "career"     && <CareerTab {...props} />}
          {tab === "team"          && <TeamTab {...props} inviteLinkBase={inviteLinkBase} />}
          {tab === "ai"            && <AITab {...props} />}
          {tab === "interviewKits" && <InterviewKitsTab />}
          {tab === "email"      && <EmailTab {...props} />}
          {tab === "calendar"   && <CalendarTab {...props} />}
          {tab === "appearance" && <AppearanceTab {...props} />}
          {tab === "cookies"    && <CookiesTab workspace={props.workspace} />}
          {tab === "danger"     && <DangerTab {...props} />}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────── Workspace ─────────────────────
// Names come from Intl.DisplayNames so they follow the UI language.
const CURRENCIES = [
  { code: "EUR", symbol: "€" },
  { code: "USD", symbol: "$" },
  { code: "GBP", symbol: "£" },
  { code: "CHF", symbol: "CHF" },
  { code: "SEK", symbol: "kr" },
  { code: "NOK", symbol: "kr" },
  { code: "DKK", symbol: "kr" },
  { code: "PLN", symbol: "zł" },
  { code: "CAD", symbol: "CA$" },
  { code: "AUD", symbol: "A$" },
  { code: "JPY", symbol: "¥" },
  { code: "INR", symbol: "₹" },
  { code: "BRL", symbol: "R$" },
  { code: "MXN", symbol: "MX$" },
];

// A curated list of common business timezones — covers the time zones our
// recruiter persona is most likely to schedule across without dumping the
// full IANA database into the picker.
const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Lisbon",
  "Europe/Stockholm",
  "Europe/Helsinki",
  "Europe/Warsaw",
  "Europe/Istanbul",
  "Africa/Lagos",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "America/Toronto",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
];

function WorkspaceTab({ workspace }: any) {
  const router = useRouter();
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const uiLocale = useLocale();
  const currencyNames = React.useMemo(() => new Intl.DisplayNames([uiLocale], { type: "currency" }), [uiLocale]);
  const [name, setName] = React.useState<string>(workspace.name);
  const [domain, setDomain] = React.useState<string>(workspace.domain);
  const [color, setColor] = React.useState<string>(workspace.color);
  const [timezone, setTimezone] = React.useState<string>(workspace.timezone || "Europe/Berlin");
  const [locale, setLocale] = React.useState<string>(workspace.locale || "en");
  const [signature, setSignature] = React.useState<string>(workspace.signature || "");
  const [currency, setCurrency] = React.useState<string>(workspace.currency || "EUR");
  const [departments, setDepartments] = React.useState<string[]>(workspace.departments || []);
  const [newDept, setNewDept] = React.useState("");
  const defaults = workspace.defaults || {};
  const [autoSend, setAutoSend] = React.useState<boolean>(defaults.autoSendConfirmations ?? true);
  const [aiRejection, setAiRejection] = React.useState<boolean>(defaults.aiRejectionDrafts ?? false);
  const [showSalary, setShowSalary] = React.useState<boolean>(defaults.showSalaryPublicly ?? true);

  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        domain,
        color,
        timezone,
        locale,
        signature: signature.trim() || null,
        currency,
        departments,
        defaults: {
          autoSendConfirmations: autoSend,
          aiRejectionDrafts: aiRejection,
          showSalaryPublicly: showSalary,
        },
      }),
    });
    setSaving(false);
    if (res.ok) {
      setSavedAt(Date.now());
      router.refresh();
    }
  }

  function addDept() {
    const v = newDept.trim();
    if (!v) return;
    if (departments.some((d) => d.toLowerCase() === v.toLowerCase())) {
      setNewDept("");
      return;
    }
    setDepartments([...departments, v]);
    setNewDept("");
  }

  return (
    <>
      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>{t("workspace.identity")}</h2>
        <p className="muted" style={{ marginBottom: 18 }}>{t("workspace.identityHint")}</p>
        <div className="row" style={{ gap: 16, marginBottom: 14 }}>
          <WorkspaceMark workspace={{ name, color }} size={48} />
          <div style={{ flex: 1 }}>
            <label className="label">{t("workspace.name")}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div className="row" style={{ gap: 14, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label className="label">{t("workspace.domain")}</label>
            <input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">{t("workspace.timezone")}</label>
            <select className="select" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {!TIMEZONES.includes(timezone) && <option value={timezone}>{timezone}</option>}
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">{t("workspace.color")}</label>
          <div className="row" style={{ gap: 6 }}>
            {["conic", "#5EC9A0", "#FF8AC6", "#7C5BEF", "#22D3EE", "#FFB54F"].map((c) => (
              <button
                key={c}
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setColor(c)}
                style={{ width: 32, height: 32, padding: 0, position: "relative" }}
              >
                <WorkspaceMark workspace={{ name, color: c }} size={20} />
                {color === c && (
                  <span style={{ position: "absolute", inset: 0, border: "2px solid var(--accent-solid)", borderRadius: 8, pointerEvents: "none" }} />
                )}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <label className="label">{t("workspace.id")} <span className="tiny muted">· {t("workspace.idHint")}</span></label>
          <input
            className="input mono"
            readOnly
            value={workspace.id}
            style={{ background: "var(--glass-bg-faint)", color: "var(--ink-2)" }}
          />
        </div>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>{t("workspace.defaults")}</h2>
        <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
          {t("workspace.defaultsHint")}
        </p>
        <div style={{ marginBottom: 6 }}>
          <label className="label">{t("workspace.signature")}</label>
          <textarea
            className="input autogrow"
            data-max-lines="8"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder={t("workspace.signaturePlaceholder", { name: workspace.name })}
            style={{ fontFamily: "inherit" }}
          />
          <p className="tiny muted" style={{ marginTop: 4 }}>
            {t("workspace.signatureHint")}
          </p>
        </div>
        <ToggleRow
          label={t("workspace.autoSend")}
          desc={t("workspace.autoSendHint")}
          on={autoSend}
          onChange={setAutoSend}
        />
        <ToggleRow
          label={t("workspace.aiRejection")}
          desc={t("workspace.aiRejectionHint")}
          on={aiRejection}
          onChange={setAiRejection}
        />
        <ToggleRow
          label={t("workspace.showSalary")}
          desc={t("workspace.showSalaryHint")}
          on={showSalary}
          onChange={setShowSalary}
        />
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>{t("language.workspaceTitle")}</h2>
        <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>{t("language.workspaceHint")}</p>
        <div style={{ maxWidth: 320 }}>
          <select className="select" value={locale} onChange={(e) => setLocale(e.target.value)}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
            ))}
          </select>
        </div>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>{t("workspace.currency")}</h2>
        <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
          {t("workspace.currencyHint")}
        </p>
        <div style={{ maxWidth: 320 }}>
          <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{currencyNames.of(c.code) ?? c.code} ({c.symbol})</option>
            ))}
          </select>
        </div>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>{t("workspace.departments")}</h2>
        <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
          {t("workspace.departmentsHint")}
        </p>
        {departments.length > 0 && (
          <div className="row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {departments.map((d) => (
              <span key={d} className="chip" style={{ gap: 6 }}>
                {d}
                <button
                  type="button"
                  className="iconbtn"
                  style={{ width: 18, height: 18 }}
                  onClick={() => setDepartments(departments.filter((x) => x !== d))}
                  aria-label={t("workspace.removeDepartment", { name: d })}
                  title={t("workspace.removeDepartment", { name: d })}
                >
                  <Icons.X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="row" style={{ gap: 8, maxWidth: 420 }}>
          <input
            className="input"
            value={newDept}
            onChange={(e) => setNewDept(e.target.value)}
            placeholder={t("workspace.departmentPlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDept();
              }
            }}
          />
          <button className="btn" type="button" onClick={addDept} disabled={!newDept.trim()}>
            <Icons.Plus size={12} stroke={2} /> {tc("add")}
          </button>
        </div>
      </Glass>

      <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
        {savedAt && (
          <span className="tiny" style={{ color: "var(--accent-solid)" }}>
            {t("workspace.savedHint")}
          </span>
        )}
        <button className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? tc("saving") : t("saveAll")}
        </button>
      </div>
    </>
  );
}

// ───────────────────────────────────────── Career site ─────────────────────
type Office = { city: string; country: string; address: string; employees: string };
type Story = { name: string; role: string; years: string; quote: string; photoUrl: string };

function CareerTab({ workspace, careerSite, publicDomain, publicScheme }: any) {
  const router = useRouter();
  const t = useTranslations("settings.career");
  const tc = useTranslations("common");
  const [state, setState] = React.useState(() => ({
    brand: careerSite?.brand || { name: workspace.name, domain: `careers.${workspace.domain}` },
    hero: careerSite?.hero || { eyebrow: "We're hiring across {n} roles", headline_1: "Help us make great things", headline_2: "feel obvious.", lede: "<p>We're a small team building thoughtful software.</p>", cta_primary: "See open roles", cta_secondary: "Meet the team" },
    about: careerSite?.about || { eyebrow: "About us", headline: "We build excellent software.", body_1: "", body_2: "", stats: [{n:"",l:""},{n:"",l:""},{n:"",l:""},{n:"",l:""}] },
    values: careerSite?.values || [],
    offices: (careerSite?.offices as Office[]) || [],
    stories: (careerSite?.stories as Story[]) || [],
    cta: careerSite?.cta || { headline: "Don't see your role?", body: "<p>Tell us what you'd want to work on.</p>", button_1: "Send us a note", button_2: "Read our handbook" },
    footer: careerSite?.footer || { email: `careers@${workspace.domain}`, company: `© ${workspace.name}` },
    customDomain: careerSite?.customDomain || "",
  }));
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/career-site", { method: "PATCH", body: JSON.stringify(state) });
    setSaving(false);
    if (res.ok) {
      setSavedAt(Date.now());
      router.refresh();
      return;
    }
    // The domain field rejects duplicates and malformed hosts with a message
    // worth reading — silently doing nothing here just looks like a dead
    // Save button.
    const body = await res.json().catch(() => null);
    setError(body?.error || t("saveFailed"));
  }

  const apex = publicDomain;
  const publicUrl = `${publicScheme}://${workspace.slug}.${apex}`;

  return (
    <>
      <Glass className="card" style={{ padding: 24 }}>
        <div className="row" style={{ alignItems: "baseline", marginBottom: 10 }}>
          <h2 style={{ flex: 1, fontSize: 18 }}>{t("domainBrand")}</h2>
          <a className="btn btn-sm" href={publicUrl} target="_blank" rel="noreferrer">{t("openSite")} <Icons.ArrowUpRight size={11}/></a>
        </div>
        <Row label={t("publicUrl")}><a className="mono" href={publicUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent-solid)" }}>{publicUrl}</a></Row>
        <Row label={t("ownDomain")}>
          <div className="col" style={{ gap: 6, alignItems: "stretch" }}>
            <input
              className="input"
              placeholder={t("ownDomainPlaceholder", { domain: `careers.${workspace.domain}` })}
              value={state.customDomain}
              onChange={(e) => setState({ ...state, customDomain: e.target.value })}
            />
            {state.customDomain.trim() ? (
              <>
                <div className="row" style={{ gap: 6, fontSize: 12.5, flexWrap: "wrap" }}>
                  <span className="chip">CNAME</span>
                  <span className="mono">{state.customDomain.trim()}</span>
                  <Icons.ArrowRight size={12} />
                  <span className="mono">{workspace.slug}.{apex}</span>
                </div>
                {careerSite?.verifiedAt && state.customDomain.trim() === (careerSite?.customDomain || "") ? (
                  <Chip good dot>{t("domainLive")}</Chip>
                ) : (
                  <Chip warn dot>
                    {t("domainPending")}
                  </Chip>
                )}
              </>
            ) : (
              <span className="tiny" style={{ color: "var(--ink-3)" }}>
                {t("domainHint")}
              </span>
            )}
          </div>
        </Row>
        <Row label={t("companyName")}>
          <input className="input" value={state.brand.name} onChange={(e) => setState({ ...state, brand: { ...state.brand, name: e.target.value } })} />
        </Row>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>{t("hero")}</h2>
        <Row label={t("eyebrow")}>
          <input className="input" value={state.hero.eyebrow} onChange={(e) => setState({ ...state, hero: { ...state.hero, eyebrow: e.target.value } })} />
        </Row>
        <Row label={t("headline1")}>
          <input className="input" value={state.hero.headline_1} onChange={(e) => setState({ ...state, hero: { ...state.hero, headline_1: e.target.value } })} />
        </Row>
        <Row label={t("headline2")}>
          <input className="input" value={state.hero.headline_2} onChange={(e) => setState({ ...state, hero: { ...state.hero, headline_2: e.target.value } })} />
        </Row>
        <Row label={t("lede")}>
          <Wysiwyg
            value={state.hero.lede || ""}
            onChange={(html) => setState({ ...state, hero: { ...state.hero, lede: html } })}
            placeholder={t("ledePlaceholder")}
            minHeight={80}
          />
        </Row>
        <Row label={t("ctaPrimary")}><input className="input" value={state.hero.cta_primary} onChange={(e) => setState({ ...state, hero: { ...state.hero, cta_primary: e.target.value } })}/></Row>
        <Row label={t("ctaSecondary")}><input className="input" value={state.hero.cta_secondary} onChange={(e) => setState({ ...state, hero: { ...state.hero, cta_secondary: e.target.value } })}/></Row>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>{t("about")}</h2>
        <Row label={t("headline")}><input className="input" value={state.about.headline} onChange={(e) => setState({ ...state, about: { ...state.about, headline: e.target.value } })}/></Row>
        <Row label={t("paragraph", { n: 1 })}>
          <Wysiwyg
            value={state.about.body_1 || ""}
            onChange={(html) => setState({ ...state, about: { ...state.about, body_1: html } })}
            placeholder={t("paragraph1Placeholder")}
            minHeight={100}
          />
        </Row>
        <Row label={t("paragraph", { n: 2 })}>
          <Wysiwyg
            value={state.about.body_2 || ""}
            onChange={(html) => setState({ ...state, about: { ...state.about, body_2: html } })}
            placeholder={t("paragraph2Placeholder")}
            minHeight={100}
          />
        </Row>
        <div className="section-h" style={{ marginTop: 14, marginBottom: 8 }}>{t("stats")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {state.about.stats.map((s: any, i: number) => (
            <div key={i} className="col" style={{ gap: 6 }}>
              <input className="input" placeholder={t("statValue")} value={s.n} onChange={(e) => {
                const stats = [...state.about.stats]; stats[i] = { ...s, n: e.target.value };
                setState({ ...state, about: { ...state.about, stats } });
              }}/>
              <input className="input" placeholder={t("statLabel")} value={s.l} onChange={(e) => {
                const stats = [...state.about.stats]; stats[i] = { ...s, l: e.target.value };
                setState({ ...state, about: { ...state.about, stats } });
              }}/>
            </div>
          ))}
        </div>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>{t("values")}</h2>
        {state.values.map((v: any, i: number) => (
          <div key={i} className="row" style={{ gap: 10, marginBottom: 10 }}>
            <input className="input" style={{ flex: 1 }} placeholder={t("valueTitle")} value={v.t} onChange={(e) => {
              const values = [...state.values]; values[i] = { ...v, t: e.target.value };
              setState({ ...state, values });
            }}/>
            <input className="input" style={{ flex: 2 }} placeholder={t("valueDesc")} value={v.b} onChange={(e) => {
              const values = [...state.values]; values[i] = { ...v, b: e.target.value };
              setState({ ...state, values });
            }}/>
            <button className="btn btn-sm btn-ghost" onClick={() => setState({ ...state, values: state.values.filter((_: any, j: number) => j !== i) })}>
              <Icons.Trash size={13}/>
            </button>
          </div>
        ))}
        <button className="btn btn-sm" onClick={() => setState({ ...state, values: [...state.values, { t: t("newValue"), b: "" }] })}>
          <Icons.Plus size={12}/> {t("addValue")}
        </button>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <div className="row" style={{ alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={{ flex: 1, fontSize: 18 }}>{t("offices")}</h2>
          <span className="tiny">{t("officesHint")}</span>
        </div>
        {state.offices.length === 0 && (
          <p className="muted" style={{ marginBottom: 12 }}>{t("officesEmpty")}</p>
        )}
        {state.offices.map((o: Office, i: number) => (
          <div key={i} className="row" style={{ gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
            <input className="input" placeholder={t("city")} style={{ flex: 1 }} value={o.city} onChange={(e) => updateAt(state, setState, "offices", i, { ...o, city: e.target.value })} />
            <input className="input" placeholder={t("country")} style={{ flex: 1 }} value={o.country} onChange={(e) => updateAt(state, setState, "offices", i, { ...o, country: e.target.value })} />
            <input className="input" placeholder={t("address")} style={{ flex: 2 }} value={o.address} onChange={(e) => updateAt(state, setState, "offices", i, { ...o, address: e.target.value })} />
            <input className="input" placeholder={t("people")} style={{ width: 90 }} value={o.employees} onChange={(e) => updateAt(state, setState, "offices", i, { ...o, employees: e.target.value })} />
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeAt(state, setState, "offices", i)}>
              <Icons.Trash size={13} />
            </button>
          </div>
        ))}
        <button className="btn btn-sm" onClick={() => setState({ ...state, offices: [...state.offices, { city: "", country: "", address: "", employees: "" }] })}>
          <Icons.Plus size={12} /> {t("addOffice")}
        </button>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <div className="row" style={{ alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={{ flex: 1, fontSize: 18 }}>{t("stories")}</h2>
          <span className="tiny">{t("storiesHint")}</span>
        </div>
        {state.stories.length === 0 && (
          <p className="muted" style={{ marginBottom: 12 }}>{t("storiesEmpty")}</p>
        )}
        {state.stories.map((s: Story, i: number) => (
          <div key={i} className="col" style={{ gap: 8, marginBottom: 16, padding: 14, borderRadius: 10, background: "var(--glass-bg-faint)", border: "0.5px solid var(--line)" }}>
            <div className="row" style={{ gap: 10 }}>
              <input className="input" placeholder={t("storyName")} style={{ flex: 1 }} value={s.name} onChange={(e) => updateAt(state, setState, "stories", i, { ...s, name: e.target.value })} />
              <input className="input" placeholder={t("storyRole")} style={{ flex: 1 }} value={s.role} onChange={(e) => updateAt(state, setState, "stories", i, { ...s, role: e.target.value })} />
              <input className="input" placeholder={t("storyTenure")} style={{ flex: 1 }} value={s.years} onChange={(e) => updateAt(state, setState, "stories", i, { ...s, years: e.target.value })} />
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeAt(state, setState, "stories", i)}>
                <Icons.Trash size={13} />
              </button>
            </div>
            <input className="input" placeholder={t("storyPhoto")} value={s.photoUrl} onChange={(e) => updateAt(state, setState, "stories", i, { ...s, photoUrl: e.target.value })} />
            <Wysiwyg
              value={s.quote || ""}
              onChange={(html) => updateAt(state, setState, "stories", i, { ...s, quote: html })}
              placeholder={t("storyQuote")}
              minHeight={80}
            />
          </div>
        ))}
        <button className="btn btn-sm" onClick={() => setState({ ...state, stories: [...state.stories, { name: "", role: "", years: "", quote: "", photoUrl: "" }] })}>
          <Icons.Plus size={12} /> {t("addStory")}
        </button>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>{t("footerCta")}</h2>
        <Row label={t("headline")}><input className="input" value={state.cta.headline} onChange={(e) => setState({ ...state, cta: { ...state.cta, headline: e.target.value } })}/></Row>
        <Row label={t("body")}>
          <Wysiwyg
            value={state.cta.body || ""}
            onChange={(html) => setState({ ...state, cta: { ...state.cta, body: html } })}
            placeholder={t("bodyPlaceholder")}
            minHeight={70}
          />
        </Row>
        <Row label={t("contactEmail")}><input className="input" value={state.footer.email} onChange={(e) => setState({ ...state, footer: { ...state.footer, email: e.target.value } })}/></Row>
        <Row label={t("legalLine")}><input className="input" value={state.footer.company} onChange={(e) => setState({ ...state, footer: { ...state.footer, company: e.target.value } })}/></Row>
      </Glass>

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {error && <span className="tiny" style={{ color: "oklch(50% 0.18 28)" }}>{error}</span>}
        {savedAt && !error && <span className="tiny" style={{ color: "var(--accent-solid)" }}>{t("savedHint")}</span>}
        <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? tc("saving") : t("savePublish")}</button>
      </div>
    </>
  );
}

function updateAt(state: any, setState: any, key: "offices" | "stories", index: number, value: any) {
  const arr = [...(state[key] || [])];
  arr[index] = value;
  setState({ ...state, [key]: arr });
}

function removeAt(state: any, setState: any, key: "offices" | "stories", index: number) {
  const arr = (state[key] || []).filter((_: any, j: number) => j !== index);
  setState({ ...state, [key]: arr });
}

// ───────────────────────────────────────── Team ─────────────────────
type TeamMember = {
  id: string;
  role: string;
  user: { id: string; name: string | null; email: string };
};

function TeamTab({ members, invites, inviteLinkBase, currentUser }: any) {
  const router = useRouter();
  const t = useTranslations("settings.team");
  const tc = useTranslations("common");
  const format = useFormatter();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("member");
  const [busy, setBusy] = React.useState(false);
  const [lastInvite, setLastInvite] = React.useState<string | null>(null);
  const [openProfileId, setOpenProfileId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const me = currentUser as { id: string; role: string };
  const canManage = me.role === "owner" || me.role === "admin";

  async function sendInvite() {
    if (!email.trim()) return;
    setBusy(true);
    const r = await fetch("/api/invites", { method: "POST", body: JSON.stringify({ email, role }) });
    const j = await r.json();
    setBusy(false);
    if (r.ok) {
      setLastInvite(inviteLinkBase + j.token);
      setEmail("");
      router.refresh();
    }
  }

  function explainError(code: string) {
    if (code === "forbidden") return t("errors.forbidden");
    if (code === "owner_required") return t("errors.ownerRequired");
    if (code === "last_owner") return t("errors.lastOwner");
    return t("errors.generic");
  }

  async function changeRole(userId: string, newRole: string) {
    setError(null);
    const res = await fetch(`/api/workspace/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(explainError(json?.error));
      return;
    }
    router.refresh();
  }

  async function removeMember(userId: string, name: string) {
    if (!window.confirm(t("confirmRemove", { name }))) return;
    setError(null);
    const res = await fetch(`/api/workspace/members/${userId}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(explainError(json?.error));
      return;
    }
    router.refresh();
  }

  return (
    <>
      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>{t("invite")}</h2>
        <div className="row" style={{ gap: 8 }}>
          <input className="input" placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select className="select" value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 140 }}>
            <option value="member">{tc("roles.member")}</option>
            <option value="admin">{tc("roles.admin")}</option>
          </select>
          <button className="btn btn-primary" disabled={busy || !email.trim()} onClick={sendInvite}>{t("sendInvite")}</button>
        </div>
        {lastInvite && (
          <div className="ai-card" style={{ marginTop: 14 }}>
            <div className="tiny" style={{ color: "var(--ink-1)" }}>{t("shareLink")}</div>
            <div className="mono" style={{ marginTop: 6, wordBreak: "break-all" }}>{lastInvite}</div>
          </div>
        )}
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, flex: 1 }}>{t("members", { count: members.length })}</h2>
          {!canManage && (
            <span className="tiny muted">{t("errors.forbidden")}</span>
          )}
        </div>

        {error && (
          <div
            className="chip chip-danger"
            style={{ marginBottom: 12, display: "inline-flex", padding: "6px 12px", height: "auto" }}
          >
            {error}
          </div>
        )}

        <table className="table">
          <thead><tr><th>{t("cols.name")}</th><th>{t("cols.email")}</th><th>{t("cols.role")}</th><th style={{ width: 220, textAlign: "right" }}>{t("cols.actions")}</th></tr></thead>
          <tbody>
            {members.map((m: TeamMember) => {
              const isSelf = m.user.id === me.id;
              // Members can't be edited by other members. Owners can only be
              // modified by other owners.
              const canEdit = canManage && (m.role !== "owner" || me.role === "owner") && !isSelf;
              const canRemove = canEdit;
              return (
                <tr key={m.id}>
                  <td>{m.user.name || "—"}{isSelf ? <span className="tiny muted" style={{ marginLeft: 6 }}>· {t("you")}</span> : null}</td>
                  <td className="tiny">{m.user.email}</td>
                  <td>
                    {canEdit ? (
                      <select
                        className="select"
                        value={m.role}
                        onChange={(e) => changeRole(m.user.id, e.target.value)}
                        style={{ width: 130, height: 30, fontSize: 12 }}
                      >
                        {me.role === "owner" && <option value="owner">{tc("roles.owner")}</option>}
                        <option value="admin">{tc("roles.admin")}</option>
                        <option value="member">{tc("roles.member")}</option>
                      </select>
                    ) : (
                      <Chip accent={m.role === "owner" || m.role === "admin"}>{tc(`roles.${m.role as "owner" | "admin" | "member"}`)}</Chip>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => setOpenProfileId(m.user.id)}>
                        <Icons.Users size={12} /> {t("view")}
                      </button>
                      {canRemove && (
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => removeMember(m.user.id, m.user.name || m.user.email)}
                          style={{ color: "oklch(50% 0.18 28)" }}
                          aria-label={t("removeLabel", { name: m.user.name || m.user.email })}
                        >
                          <Icons.Trash size={12} /> {tc("remove")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {invites.length > 0 && (
          <>
            <h3 style={{ marginTop: 24, marginBottom: 10 }}>{t("pendingInvites", { count: invites.length })}</h3>
            <table className="table">
              <thead><tr><th>{t("cols.email")}</th><th>{t("cols.role")}</th><th>{t("cols.expires")}</th><th>{t("cols.link")}</th></tr></thead>
              <tbody>
                {invites.map((i: any) => (
                  <tr key={i.id}>
                    <td>{i.email}</td>
                    <td><Chip>{tc(`roles.${i.role as "owner" | "admin" | "member"}`)}</Chip></td>
                    <td className="tiny">{format.dateTime(new Date(i.expiresAt), { dateStyle: "medium" })}</td>
                    <td className="tiny mono"><a href={inviteLinkBase + i.token} style={{ color: "var(--accent-solid)" }}>{t("copy")}</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Glass>

      {openProfileId && (
        <TeammateSheet
          userId={openProfileId}
          onClose={() => setOpenProfileId(null)}
        />
      )}
    </>
  );
}

function TeammateSheet({ userId, onClose }: { userId: string; onClose: () => void }) {
  const t = useTranslations("settings.team");
  const tc = useTranslations("common");
  const format = useFormatter();
  const [data, setData] = React.useState<any | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch(`/api/workspace/members/${userId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setData)
      .catch(() => setError(t("loadFailed")));
  }, [userId]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet glass glass-strong sheet-md">
        <div className="sheet-hd">
          <div className="grow">
            <div className="topbar-crumb">{t("crumb")}</div>
            <h2 style={{ fontSize: 18 }}>{data?.name || t("teammate")}</h2>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label={tc("close")}>
            <Icons.X size={15} />
          </button>
        </div>
        <div className="scroll" style={{ padding: 22, overflowY: "auto" }}>
          {error && <div className="chip chip-danger">{error}</div>}
          {!data && !error && <div className="ai-shimmer" style={{ height: 140, borderRadius: 12 }} />}
          {data && (
            <div className="col" style={{ gap: 18 }}>
              <div className="row" style={{ gap: 14 }}>
                <div
                  style={{
                    width: 64, height: 64, borderRadius: "50%",
                    background: "var(--glass-bg-faint)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, fontWeight: 600, color: "var(--ink-1)",
                  }}
                >
                  {(data.name || data.email)[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{data.name || data.email}</div>
                  <div className="tiny">{data.title || "—"}</div>
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    <Chip accent={data.role === "owner" || data.role === "admin"}>{tc(`roles.${data.role as "owner" | "admin" | "member"}`)}</Chip>
                    <span className="tiny muted">{t("joined", { date: format.dateTime(new Date(data.joinedAt), { dateStyle: "medium" }) })}</span>
                  </div>
                </div>
              </div>
              <Glass faint style={{ padding: 14, borderRadius: 10 }}>
                <ProfileRow label={t("profile.email")}>{data.email}</ProfileRow>
                <ProfileRow label={t("profile.pronouns")}>{data.pronouns || "—"}</ProfileRow>
                <ProfileRow label={t("profile.location")}>{data.location || "—"}</ProfileRow>
                <ProfileRow label={t("profile.timezone")}>{data.timezone || "—"}</ProfileRow>
                <ProfileRow label={t("profile.workingHours")}>{data.workingHours || "—"}</ProfileRow>
              </Glass>
              {data.bio && (
                <Glass faint style={{ padding: 14, borderRadius: 10 }}>
                  <div className="tiny" style={{ marginBottom: 6 }}>{t("profile.bio")}</div>
                  <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-1)", whiteSpace: "pre-wrap" }}>{data.bio}</p>
                </Glass>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ProfileRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row" style={{ padding: "6px 0", fontSize: 13, borderBottom: "0.5px solid var(--line)" }}>
      <div style={{ width: 130, color: "var(--ink-2)" }}>{label}</div>
      <div style={{ flex: 1, color: "var(--ink-0)" }}>{children}</div>
    </div>
  );
}

// ───────────────────────────────────────── AI ─────────────────────
function AITab({ ai, members, currentUser }: any) {
  const router = useRouter();
  const t = useTranslations("settings.ai");
  const tc = useTranslations("common");
  const format = useFormatter();
  const [provider, setProvider] = React.useState(ai?.provider || "anthropic");
  const [model, setModel] = React.useState(ai?.model || AI_PROVIDERS.find((p) => p.id === "anthropic")!.models[1]);
  const [apiKey, setApiKey] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState(ai?.baseUrl || "");
  // Default to everything-on for new workspaces. Recap and Pulse get on-by-default
  // because they don't make AI calls unless their own AI sub-features are enabled.
  const [features, setFeatures] = React.useState<Record<string, boolean>>(
    ai?.features || {
      summary: true, draft: true, jd: true, screen: true, rejection: false,
      recap: true, pulse: true,
      recapDaily: true, recapWeekly: true, recapMonthly: false,
      recapSuggestedActions: false,
      pulseSentiment: true, pulseAlerts: true, pulseLockOnUnsubscribe: true,
    },
  );
  // Recap settings — the rich shape (tone / timing / thresholds / recipients).
  // Mirrors AIConfig.recapSettings in the schema.
  type RecapSettings = {
    tone?: "factual" | "conversational" | "quirky";
    timing?: { dailyHour?: number; weeklyDay?: number; monthlyDay?: number };
    thresholds?: { staleStageMultiplier?: number; awaitingReplyHours?: number; retentionWarningDays?: number };
    recipients?: string[]; // user ids; undefined = all owners+admins (default)
  };
  const initialRecapSettings: RecapSettings = (ai?.recapSettings as RecapSettings) || {};
  const [recapTone, setRecapTone] = React.useState<RecapSettings["tone"]>(
    initialRecapSettings.tone || "factual",
  );
  const [dailyHour, setDailyHour] = React.useState<number>(initialRecapSettings.timing?.dailyHour ?? 8);
  const [weeklyDay, setWeeklyDay] = React.useState<number>(initialRecapSettings.timing?.weeklyDay ?? 1);
  const [monthlyDay, setMonthlyDay] = React.useState<number>(initialRecapSettings.timing?.monthlyDay ?? 1);
  const [staleMult, setStaleMult] = React.useState<number>(
    initialRecapSettings.thresholds?.staleStageMultiplier ?? 1.5,
  );
  const [awaitingHrs, setAwaitingHrs] = React.useState<number>(
    initialRecapSettings.thresholds?.awaitingReplyHours ?? 48,
  );
  const [retentionDays, setRetentionDays] = React.useState<number>(
    initialRecapSettings.thresholds?.retentionWarningDays ?? 30,
  );
  // null = "all owners + admins" (worker default); array = explicit subset.
  const [recipients, setRecipients] = React.useState<string[] | null>(
    initialRecapSettings.recipients ?? null,
  );
  const [thresholdsOpen, setThresholdsOpen] = React.useState(false);

  // Filter for which members are eligible recipients = workspace admins.
  const adminMembers = ((members as { id: string; role: string; user: { id: string; name: string | null; email: string } }[]) || [])
    .filter((m) => m.role === "owner" || m.role === "admin");
  const [redact, setRedact] = React.useState(ai?.redactPII ?? true);
  const [nolog, setNolog] = React.useState(ai?.noLog ?? true);
  const [cache, setCache] = React.useState(ai?.cacheEnabled ?? true);
  const [testing, setTesting] = React.useState<"idle" | "busy" | "ok" | "err">("idle");
  const [saving, setSaving] = React.useState(false);
  const [testingRecap, setTestingRecap] = React.useState<"idle" | "busy" | "ok" | "err">("idle");

  const providerInfo = AI_PROVIDERS.find((p) => p.id === provider) || AI_PROVIDERS[0];

  function toggleFeature(id: string) {
    setFeatures({ ...features, [id]: !features[id] });
  }

  async function save() {
    setSaving(true);
    await fetch("/api/ai-config", {
      method: "PATCH",
      body: JSON.stringify({
        provider,
        model,
        apiKey: apiKey || undefined,
        // Only send baseUrl when relevant — server normalises empty → null.
        baseUrl: provider === "ollama" ? baseUrl.trim() : null,
        features,
        redactPII: redact,
        noLog: nolog,
        cacheEnabled: cache,
        recapSettings: {
          tone: recapTone,
          timing: { dailyHour, weeklyDay, monthlyDay },
          thresholds: {
            staleStageMultiplier: staleMult,
            awaitingReplyHours: awaitingHrs,
            retentionWarningDays: retentionDays,
          },
          // `recipients: undefined` (key absent) means "default to all admins"
          // — only persist an explicit subset.
          ...(recipients ? { recipients } : {}),
        },
      }),
    });
    setSaving(false);
    router.refresh();
  }

  async function test() {
    setTesting("busy");
    const r = await fetch("/api/ai/test");
    setTesting(r.ok ? "ok" : "err");
    setTimeout(() => setTesting("idle"), 3000);
  }

  async function sendTestRecap() {
    setTestingRecap("busy");
    const r = await fetch("/api/recap?force=1");
    setTestingRecap(r.ok ? "ok" : "err");
    setTimeout(() => setTestingRecap("idle"), 4000);
  }

  const tokensPct = Math.min(100, Math.round(((ai?.tokensUsed || 0) / Math.max(1, ai?.tokensQuota || 1)) * 100));

  return (
    <>
      {/* ── Provider ─────────────────────────────────────────────── */}
      <Glass className="card" style={{ padding: 22, borderRadius: 14 }}>
        <h2 style={{ fontSize: 18, marginBottom: 14 }}>{t("provider")}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 18 }}>
          {AI_PROVIDERS.map((p) => {
            const sel = provider === p.id;
            return (
              <div
                key={p.id}
                onClick={() => { setProvider(p.id); setModel(p.models[1] || p.models[0]); }}
                style={{
                  padding: 16, borderRadius: 12, cursor: "default",
                  background: sel ? "var(--accent-soft)" : "var(--glass-bg-faint)",
                  border: `0.5px solid ${sel ? "var(--accent-solid)" : "var(--line)"}`,
                }}
              >
                <div className="row" style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", flex: 1 }}>{p.name}</span>
                  {p.badge && (
                    <span className="chip" style={{
                      fontSize: 10, height: 18, padding: "0 7px",
                      background: p.id === "anthropic" ? "var(--accent-soft)" : "var(--glass-bg)",
                      color: p.id === "anthropic" ? "var(--accent-solid)" : "var(--ink-2)",
                      borderColor: "transparent",
                    }}>{t(`providers.${p.id}.badge` as "providers.anthropic.badge")}</span>
                  )}
                </div>
                <div className="tiny" style={{ lineHeight: 1.4 }}>{t(`providers.${p.id}.desc`)}</div>
                {sel && (
                  <div className="row" style={{ marginTop: 10, gap: 4, color: "var(--accent-solid)" }}>
                    <Icons.Check size={12} stroke={2.4}/>
                    <span className="tiny" style={{ color: "var(--accent-solid)", fontWeight: 500 }}>{t("selected")}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <Field label={provider === "ollama" ? t("apiKeyOptional") : t("apiKeyFor", { provider: providerInfo.name })}>
            <input
              className="input"
              type="password"
              placeholder={
                provider === "ollama"
                  ? t("apiKeyOllama")
                  : ai?.hasKey
                  ? t("apiKeySet")
                  : t("apiKeyPaste")
              }
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </Field>
          <Field label={t("model")}>
            <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
              {providerInfo.models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        {provider === "ollama" && (
          <div style={{ marginTop: 8 }}>
            <Field label={t("serverUrl")}>
              <input
                className="input"
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
              />
            </Field>
            <p className="tiny" style={{ marginTop: 4, color: "var(--ink-2)" }}>
              {t("serverUrlHint")}
            </p>
          </div>
        )}
        <div className="row" style={{ marginTop: 4, gap: 10 }}>
          <button className="btn btn-sm" onClick={test} disabled={testing === "busy"}>
            {testing === "busy" ? <span className="ai-shimmer" style={{ width: 14, height: 14, borderRadius: 50 }}/> : <Icons.Sparkle size={12} stroke={2}/>}
            {testing === "busy" ? t("testing") : testing === "ok" ? t("connected") : testing === "err" ? t("failed") : t("testConnection")}
          </button>
          {testing === "ok" && (
            <span className="chip" style={{ background: "color-mix(in oklab, oklch(68% 0.16 150) 16%, transparent)", color: "oklch(45% 0.16 150)", borderColor: "transparent" }}>
              <Icons.Check size={11} stroke={2.4}/> {t("connected")}
            </span>
          )}
          {testing === "err" && (
            <span className="chip" style={{ background: "color-mix(in oklab, oklch(60% 0.18 28) 16%, transparent)", color: "oklch(50% 0.18 28)", borderColor: "transparent" }}>
              <Icons.X size={11}/> {t("failed")}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <span className="tiny">{t("tokensUsed", { used: format.number(ai?.tokensUsed || 0), quota: format.number(ai?.tokensQuota || 100000) })}</span>
        </div>
        <div className="funnel-bar" style={{ marginTop: 8 }}>
          <div className="funnel-fill" style={{ width: `${tokensPct}%` }} />
        </div>
      </Glass>

      {/* ── Where AI shows up ────────────────────────────────────── */}
      <Glass className="card" style={{ padding: 22, borderRadius: 14 }}>
        <h2 style={{ fontSize: 18, marginBottom: 14 }}>{t("whereAi")}</h2>
        {AI_FEATURES.map((f, i) => (
          <ToggleRow
            key={f.id}
            label={t(`features.${f.id}.name` as "features.summary.name")}
            desc={t(`features.${f.id}.desc` as "features.summary.desc")}
            on={features[f.id] ?? i < 3}
            onChange={() => toggleFeature(f.id)}
          />
        ))}
      </Glass>

      {/* ── Recap & digests ──────────────────────────────────────── */}
      <Glass className="card" style={{ padding: 22, borderRadius: 14 }}>
        <h2 style={{ fontSize: 18, marginBottom: 6 }}>{t("recap.title")}</h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
          {t("recap.hint")}
        </p>

        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-1)", marginBottom: 8 }}>
            {t("recap.cadences")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {[
              { id: "recapDaily",   label: t("recap.daily"),   desc: t("recap.dailyDesc") },
              { id: "recapWeekly",  label: t("recap.weekly"),  desc: t("recap.weeklyDesc") },
              { id: "recapMonthly", label: t("recap.monthly"), desc: t("recap.monthlyDesc") },
            ].map((c) => {
              const on = features[c.id] !== false;
              return (
                <div
                  key={c.id}
                  onClick={() => toggleFeature(c.id)}
                  style={{
                    padding: 14, borderRadius: 12, cursor: "default",
                    background: on ? "var(--accent-soft)" : "var(--glass-bg-faint)",
                    border: `0.5px solid ${on ? "var(--accent-solid)" : "var(--line)"}`,
                  }}
                >
                  <div className="row" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{c.label}</span>
                    {on && <Icons.Check size={14} stroke={2.4} style={{ color: "var(--accent-solid)" }}/>}
                  </div>
                  <div className="tiny">{c.desc}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Timing — three SFields side by side per RECAP_FEATURE.md §11.3.
            Daily hour / weekly day / monthly day, all workspace-local. */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 16 }}>
          <Field label={t("recap.dailyDelivery")}>
            <select className="select" value={dailyHour} onChange={(e) => setDailyHour(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => h).map((h) => (
                <option key={h} value={h}>{t("recap.hourLocal", { hour: `${String(h).padStart(2, "0")}:00` })}</option>
              ))}
            </select>
          </Field>
          <Field label={t("recap.weeklyDelivery")}>
            <select className="select" value={weeklyDay} onChange={(e) => setWeeklyDay(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                // 2024-01-01 was a Monday, so day d (1 = Monday) is Jan d.
                <option key={d} value={d}>{format.dateTime(new Date(2024, 0, d), { weekday: "long" })}</option>
              ))}
            </select>
          </Field>
          <Field label={t("recap.monthlyDelivery")}>
            <select className="select" value={monthlyDay} onChange={(e) => setMonthlyDay(Number(e.target.value))}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{t("recap.dayN", { n: d })}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* Tone — selection-card grid (Factual / Conversational / Quirky).
            Mirrors the Accent palette pattern from the design prototype. */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-1)", marginBottom: 8 }}>
            {t("recap.tone")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {([
              { id: "factual" },
              { id: "conversational" },
              { id: "quirky" },
            ] as const).map((tn) => {
              const sel = recapTone === tn.id;
              return (
                <div
                  key={tn.id}
                  onClick={() => setRecapTone(tn.id)}
                  style={{
                    padding: 14, borderRadius: 12, cursor: "default",
                    background: sel ? "var(--accent-soft)" : "var(--glass-bg-faint)",
                    border: `0.5px solid ${sel ? "var(--accent-solid)" : "var(--line)"}`,
                  }}
                >
                  <div className="row" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{t(`recap.tones.${tn.id}.label`)}</span>
                    {sel && <Icons.Check size={14} stroke={2.4} style={{ color: "var(--accent-solid)" }}/>}
                  </div>
                  <div className="tiny" style={{ fontStyle: "italic" }}>{t(`recap.tones.${tn.id}.preview`)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recipients — explicit subset of admins, or "all" by default. */}
        <div style={{ marginTop: 16 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-1)", flex: 1 }}>
              {t("recap.recipients")}
            </span>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setRecipients(recipients === null ? adminMembers.map((m) => m.user.id) : null)}
            >
              {recipients === null ? t("customize") : t("recap.allAdmins")}
            </button>
          </div>
          {recipients === null ? (
            <div className="tiny" style={{ color: "var(--ink-2)" }}>
              {t("recap.sendingToAll", { count: adminMembers.length })}
            </div>
          ) : (
            <Glass faint style={{ borderRadius: 10, overflow: "hidden" }}>
              {adminMembers.map((m, i) => {
                const on = recipients.includes(m.user.id);
                return (
                  <div
                    key={m.user.id}
                    className="row"
                    style={{
                      padding: "10px 14px",
                      borderBottom: i < adminMembers.length - 1 ? "0.5px solid var(--line)" : "none",
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{m.user.name || m.user.email}</div>
                      <div className="tiny">{m.user.email} · {tc(`roles.${m.role as "owner" | "admin" | "member"}`)}</div>
                    </div>
                    <button
                      className={`switch ${on ? "on" : ""}`}
                      onClick={() =>
                        setRecipients(
                          on
                            ? recipients.filter((id) => id !== m.user.id)
                            : [...recipients, m.user.id],
                        )
                      }
                    />
                  </div>
                );
              })}
            </Glass>
          )}
        </div>

        <div style={{ borderTop: "0.5px solid var(--line)", marginTop: 14, paddingTop: 4 }}>
          <ToggleRow
            label={t("recap.suggested")}
            desc={t("recap.suggestedHint")}
            on={features.recapSuggestedActions === true}
            onChange={() => toggleFeature("recapSuggestedActions")}
          />
        </div>

        {/* Advanced thresholds — collapsed disclosure per §11.4. */}
        <div className="row" style={{ paddingTop: 12, borderTop: "0.5px solid var(--line)", marginTop: 4 }}>
          <span className="tiny" style={{ flex: 1, color: "var(--ink-2)" }}>{t("recap.advanced")}</span>
          <button className="btn btn-sm btn-ghost" onClick={() => setThresholdsOpen((v) => !v)}>
            {thresholdsOpen ? t("hide") : t("customize")} <Icons.ChevronDown size={12}/>
          </button>
        </div>
        {thresholdsOpen && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
            <Field label={t("recap.staleMult")}>
              <input
                className="input"
                type="number"
                step={0.1}
                min={0.5}
                max={10}
                value={staleMult}
                onChange={(e) => setStaleMult(parseFloat(e.target.value) || 1.5)}
              />
              <div className="tiny" style={{ marginTop: 4, color: "var(--ink-2)" }}>{t("recap.staleMultHint")}</div>
            </Field>
            <Field label={t("recap.awaiting")}>
              <input
                className="input"
                type="number"
                min={1}
                max={720}
                value={awaitingHrs}
                onChange={(e) => setAwaitingHrs(parseInt(e.target.value, 10) || 48)}
              />
              <div className="tiny" style={{ marginTop: 4, color: "var(--ink-2)" }}>{t("recap.awaitingHint")}</div>
            </Field>
            <Field label={t("recap.retention")}>
              <input
                className="input"
                type="number"
                min={1}
                max={365}
                value={retentionDays}
                onChange={(e) => setRetentionDays(parseInt(e.target.value, 10) || 30)}
              />
              <div className="tiny" style={{ marginTop: 4, color: "var(--ink-2)" }}>{t("recap.retentionHint")}</div>
            </Field>
          </div>
        )}

        <div className="row" style={{ marginTop: 12, gap: 10 }}>
          <button className="btn btn-sm" onClick={sendTestRecap} disabled={testingRecap === "busy"}>
            {testingRecap === "busy" ? (
              <span className="ai-shimmer" style={{ width: 14, height: 14, borderRadius: 50 }}/>
            ) : (
              <Icons.Sparkle size={12} stroke={2}/>
            )}
            {testingRecap === "busy" ? t("recap.building") : t("recap.buildNow")}
          </button>
          {testingRecap === "ok" && (
            <span className="chip" style={{ background: "color-mix(in oklab, oklch(68% 0.16 150) 16%, transparent)", color: "oklch(45% 0.16 150)", borderColor: "transparent" }}>
              <Icons.Check size={11} stroke={2.4}/> {t("recap.regenerated")}
            </span>
          )}
          {testingRecap === "err" && (
            <span className="chip" style={{ background: "color-mix(in oklab, oklch(60% 0.18 28) 16%, transparent)", color: "oklch(50% 0.18 28)", borderColor: "transparent" }}>
              <Icons.X size={11}/> {t("recap.buildFailed")}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <span className="tiny">
            {recipients === null ? t("recap.adminRecipients", { count: adminMembers.length }) : t("recap.selectedRecipients", { count: recipients.length })}
          </span>
        </div>
      </Glass>

      {/* ── Pulse — engagement signal ────────────────────────────── */}
      <Glass className="card" style={{ padding: 22, borderRadius: 14 }}>
        <h2 style={{ fontSize: 18, marginBottom: 6 }}>{t("pulse.title")}</h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
          {t("pulse.hint")}
        </p>
        <ToggleRow
          label={t("pulse.sentiment")}
          desc={t("pulse.sentimentHint")}
          on={features.pulseSentiment !== false}
          onChange={() => toggleFeature("pulseSentiment")}
        />
        <ToggleRow
          label={t("pulse.alerts")}
          desc={t("pulse.alertsHint")}
          on={features.pulseAlerts !== false}
          onChange={() => toggleFeature("pulseAlerts")}
        />
        <ToggleRow
          label={t("pulse.lock")}
          desc={t("pulse.lockHint")}
          on={features.pulseLockOnUnsubscribe !== false}
          onChange={() => toggleFeature("pulseLockOnUnsubscribe")}
        />
      </Glass>

      {/* ── Review queue rules ───────────────────────────────────── */}
      <ReviewQueueRulesCard ai={ai} role={currentUser?.role || "member"} />

      {/* ── Data & privacy ───────────────────────────────────────── */}
      <Glass className="card" style={{ padding: 22, borderRadius: 14 }}>
        <h2 style={{ fontSize: 18, marginBottom: 6 }}>{t("privacy.title")}</h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
          {t("privacy.hint", { provider: providerInfo.name })}
        </p>
        <ToggleRow label={t("privacy.redact")} desc={t("privacy.redactHint")} on={redact} onChange={setRedact}/>
        <ToggleRow label={t("privacy.noLog")} desc={t("privacy.noLogHint")} on={nolog} onChange={setNolog}/>
        <ToggleRow label={t("privacy.cache")} desc={t("privacy.cacheHint")} on={cache} onChange={setCache}/>
      </Glass>

      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? tc("saving") : t("saveChanges")}</button>
      </div>
    </>
  );
}

function ToggleRow({ label, desc, on, onChange }: { label: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="row" style={{ padding: "12px 0", borderBottom: "0.5px solid var(--line)" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{label}</div>
        <div className="tiny">{desc}</div>
      </div>
      <button className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)} />
    </div>
  );
}

// ── Review queue rules card ──────────────────────────────────────────
// Lives inside the AI tab. Each row is a bucket from BUCKETS with a
// toggle + threshold inputs (where the bucket has any). Save flushes a
// PATCH against /api/review-queue/rules which normalizes and invalidates
// the workspace's cache rows.
//
// Phase 1 ships the 5 prototype buckets; the rest of BUCKETS render too
// so admins can pre-configure for Phase 2 — but they're disabled by
// default and the worker quietly skips them.

type RuleBucketState = {
  enabled: boolean;
  severity: 1 | 2 | 3 | 4 | 5;
  thresholds: Record<string, number>;
};
type RuleState = {
  buckets: Record<string, RuleBucketState>;
  scope: "mine" | "workspace";
  aiOverlay: { enabled: boolean; maxItems: 1 | 2 | 3 | 4 };
};

// Labels live in messages/<locale>/settings.json under reviewQueue.buckets / .thresholds.
const RQ_BUCKETS: Array<{
  id: string;
  icon: keyof typeof Icons;
  defaultSeverity: 1 | 2 | 3 | 4 | 5;
  enabledByDefault: boolean;
  thresholds: Array<{ key: string; min: number; max: number; step: number; default: number }>;
  phase: 1 | 2;
}> = [
  {
    id: "no-reply",
    icon: "Mail",
    defaultSeverity: 5,
    enabledByDefault: true,
    thresholds: [],
    phase: 1,
  },
  {
    id: "post-interview",
    icon: "Pipeline",
    defaultSeverity: 5,
    enabledByDefault: true,
    thresholds: [
      { key: "interviewDecisionDays", min: 3, max: 30, step: 1, default: 10 },
    ],
    phase: 1,
  },
  {
    id: "offer-pending",
    icon: "Heart",
    defaultSeverity: 5,
    enabledByDefault: true,
    thresholds: [
      { key: "offerNudgeDays", min: 1, max: 10, step: 1, default: 3 },
    ],
    phase: 1,
  },
  {
    id: "stale-applied",
    icon: "Clock",
    defaultSeverity: 4,
    enabledByDefault: true,
    thresholds: [
      { key: "staleAppliedDays", min: 1, max: 14, step: 1, default: 3 },
    ],
    phase: 1,
  },
  {
    id: "schedule-needed",
    icon: "Calendar",
    defaultSeverity: 4,
    enabledByDefault: true,
    thresholds: [
      { key: "scheduleWindowDays", min: 2, max: 14, step: 1, default: 5 },
    ],
    phase: 1,
  },
  {
    id: "missing-debrief",
    icon: "FileText",
    defaultSeverity: 3,
    enabledByDefault: true,
    thresholds: [
      { key: "debriefSlaHours", min: 4, max: 72, step: 1, default: 24 },
    ],
    phase: 1,
  },
  {
    id: "reference-overdue",
    icon: "Check",
    defaultSeverity: 3,
    enabledByDefault: false,
    thresholds: [
      { key: "referenceSlaDays", min: 1, max: 14, step: 1, default: 5 },
    ],
    phase: 2,
  },
  {
    id: "long-cold-scorer",
    icon: "Star",
    defaultSeverity: 4,
    enabledByDefault: true,
    thresholds: [
      { key: "coldScorerMinScore", min: 50, max: 100, step: 1, default: 80 },
      { key: "coldScorerStageMult", min: 1.0, max: 4.0, step: 0.1, default: 2.0 },
    ],
    phase: 1,
  },
];

function defaultRuleState(role: string): RuleState {
  const buckets: Record<string, RuleBucketState> = {};
  for (const b of RQ_BUCKETS) {
    const thresholds: Record<string, number> = {};
    for (const t of b.thresholds) thresholds[t.key] = t.default;
    buckets[b.id] = {
      enabled: b.enabledByDefault,
      severity: b.defaultSeverity,
      thresholds,
    };
  }
  return {
    buckets,
    scope: role === "owner" || role === "admin" ? "workspace" : "mine",
    aiOverlay: { enabled: false, maxItems: 4 },
  };
}

function ReviewQueueRulesCard({ ai, role }: { ai: any; role: string }) {
  const router = useRouter();
  const t = useTranslations("settings.reviewQueue");
  const tc = useTranslations("common");
  const initial = React.useMemo<RuleState>(() => {
    const base = defaultRuleState(role);
    const persisted = (ai?.reviewRules || {}) as Partial<RuleState>;
    return {
      buckets: { ...base.buckets, ...mergeBuckets(base.buckets, persisted.buckets) },
      scope: persisted.scope === "mine" || persisted.scope === "workspace" ? persisted.scope : base.scope,
      aiOverlay: {
        enabled: typeof persisted.aiOverlay?.enabled === "boolean" ? persisted.aiOverlay.enabled : base.aiOverlay.enabled,
        maxItems: persisted.aiOverlay?.maxItems && [1, 2, 3, 4].includes(persisted.aiOverlay.maxItems)
          ? persisted.aiOverlay.maxItems
          : base.aiOverlay.maxItems,
      },
    };
  }, [ai?.reviewRules, role]);

  const [state, setState] = React.useState<RuleState>(initial);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function updateBucket(id: string, patch: Partial<RuleBucketState>) {
    setState((s) => ({
      ...s,
      buckets: { ...s.buckets, [id]: { ...s.buckets[id], ...patch } },
    }));
  }
  function updateThreshold(bucketId: string, key: string, value: number) {
    setState((s) => ({
      ...s,
      buckets: {
        ...s.buckets,
        [bucketId]: {
          ...s.buckets[bucketId],
          thresholds: { ...s.buckets[bucketId].thresholds, [key]: value },
        },
      },
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const r = await fetch("/api/review-queue/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j?.error === "forbidden" ? t("forbidden") : t("saveFailed"));
      return;
    }
    setSavedAt(Date.now());
    router.refresh();
  }

  async function rebuildNow() {
    const r = await fetch("/api/review-queue/refresh", { method: "POST" });
    if (r.status === 429) {
      setError(t("rateLimited"));
    } else if (r.ok) {
      setError(null);
      setSavedAt(Date.now());
    }
  }

  return (
    <Glass className="card" id="review-queue" style={{ padding: 22, borderRadius: 14 }}>
      <div className="row" style={{ alignItems: "baseline", marginBottom: 6 }}>
        <h2 style={{ fontSize: 18, flex: 1 }}>{t("title")}</h2>
        <span className="tiny muted">{t("cacheHint")}</span>
      </div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
        {t("hint")}
      </p>

      {RQ_BUCKETS.map((b) => {
        const s = state.buckets[b.id] || defaultRuleState(role).buckets[b.id];
        const I = Icons[b.icon];
        const label = t(`buckets.${b.id}.label` as "buckets.no-reply.label");
        return (
          <div
            key={b.id}
            style={{
              padding: "12px 0",
              borderBottom: "0.5px solid var(--line)",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 8 }}>
                <I size={14} style={{ color: "var(--ink-2)" }} />
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{label}</span>
                {b.phase === 2 && (
                  <span
                    className="chip"
                    style={{ height: 18, fontSize: 10, padding: "0 6px", color: "var(--ink-2)" }}
                  >
                    {t("awaitingSchema")}
                  </span>
                )}
              </div>
              <div className="tiny" style={{ marginTop: 2 }}>{t(`buckets.${b.id}.desc` as "buckets.no-reply.desc")}</div>
              {b.thresholds.length > 0 && (
                <div className="row" style={{ gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                  {b.thresholds.map((th) => (
                    <label key={th.key} className="row" style={{ gap: 6, fontSize: 12.5 }}>
                      <span className="tiny" style={{ color: "var(--ink-2)" }}>{t(`thresholds.${th.key}.label` as "thresholds.offerNudgeDays.label")}</span>
                      <input
                        className="input"
                        type="number"
                        min={th.min}
                        max={th.max}
                        step={th.step}
                        value={s.thresholds[th.key] ?? th.default}
                        onChange={(e) => updateThreshold(b.id, th.key, Number(e.target.value))}
                        style={{ width: 88, height: 28, padding: "0 8px", fontSize: 12.5 }}
                      />
                      <span className="tiny" style={{ color: "var(--ink-2)" }}>{t(`thresholds.${th.key}.suffix` as "thresholds.offerNudgeDays.suffix")}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="row" style={{ gap: 10 }}>
              <SeverityDots value={s.severity} onChange={(v) => updateBucket(b.id, { severity: v })} />
              <button
                className={`switch ${s.enabled ? "on" : ""}`}
                onClick={() => updateBucket(b.id, { enabled: !s.enabled })}
                aria-label={s.enabled ? t("disable", { label }) : t("enable", { label })}
              />
            </div>
          </div>
        );
      })}

      <div className="row" style={{ marginTop: 14, gap: 14, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{t("aiOverlay")}</div>
          <div className="tiny">{t("aiOverlayHint")}</div>
        </div>
        <select
          className="select"
          value={state.aiOverlay.maxItems}
          onChange={(e) => setState((s) => ({ ...s, aiOverlay: { ...s.aiOverlay, maxItems: Number(e.target.value) as 1 | 2 | 3 | 4 } }))}
          disabled={!state.aiOverlay.enabled}
          style={{ width: 110, height: 30, fontSize: 12.5 }}
        >
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{t("maxN", { n })}</option>)}
        </select>
        <button
          className={`switch ${state.aiOverlay.enabled ? "on" : ""}`}
          onClick={() => setState((s) => ({ ...s, aiOverlay: { ...s.aiOverlay, enabled: !s.aiOverlay.enabled } }))}
        />
      </div>

      <div className="row" style={{ marginTop: 14, gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="tiny" style={{ marginBottom: 4, color: "var(--ink-2)" }}>{t("defaultScope")}</div>
          <div className="row" style={{ gap: 0 }}>
            {(["mine", "workspace"] as const).map((opt) => (
              <button
                key={opt}
                className="btn btn-sm"
                onClick={() => setState((s) => ({ ...s, scope: opt }))}
                style={{
                  height: 28,
                  padding: "0 12px",
                  fontSize: 12.5,
                  borderRadius: opt === "mine" ? "8px 0 0 8px" : "0 8px 8px 0",
                  background: state.scope === opt ? "var(--glass-bg-strong)" : "transparent",
                  borderColor: state.scope === opt ? "var(--glass-border)" : "var(--line)",
                }}
              >
                {opt === "mine" ? t("scopeMine") : t("scopeWorkspace")}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 16, gap: 10 }}>
        {error && <span className="tiny" style={{ color: "oklch(50% 0.18 28)" }}>{error}</span>}
        {savedAt && !error && (
          <span className="tiny" style={{ color: "var(--accent-solid)" }}>{t("savedHint")}</span>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={rebuildNow}>
          <Icons.Refresh size={11} /> {t("rebuild")}
        </button>
        <button className="btn btn-sm btn-primary" disabled={saving} onClick={save}>
          {saving ? tc("saving") : t("saveRules")}
        </button>
      </div>
    </Glass>
  );
}

function mergeBuckets(
  defaults: Record<string, RuleBucketState>,
  persisted: Partial<Record<string, Partial<RuleBucketState>>> | undefined,
): Record<string, RuleBucketState> {
  const out: Record<string, RuleBucketState> = { ...defaults };
  if (!persisted) return out;
  for (const [id, override] of Object.entries(persisted)) {
    if (!override || !out[id]) continue;
    out[id] = {
      enabled: typeof override.enabled === "boolean" ? override.enabled : out[id].enabled,
      severity: (typeof override.severity === "number" && override.severity >= 1 && override.severity <= 5
        ? (override.severity as 1 | 2 | 3 | 4 | 5)
        : out[id].severity),
      thresholds: { ...out[id].thresholds, ...(override.thresholds || {}) },
    };
  }
  return out;
}

function SeverityDots({ value, onChange }: { value: 1 | 2 | 3 | 4 | 5; onChange: (v: 1 | 2 | 3 | 4 | 5) => void }) {
  const t = useTranslations("settings.reviewQueue");
  return (
    <div className="row" style={{ gap: 2 }} role="radiogroup" aria-label={t("severity")}>
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          onClick={() => onChange(n)}
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            border: 0,
            padding: 0,
            cursor: "pointer",
            background: n <= value ? "var(--accent-solid)" : "var(--glass-bg-faint)",
            opacity: n <= value ? 1 : 0.6,
          }}
        />
      ))}
    </div>
  );
}

// ───────────────────────────────────────── Email ─────────────────────
function EmailTab({ email, workspace, currentUser }: any) {
  const router = useRouter();
  const t = useTranslations("settings.email");
  const tc = useTranslations("common");
  const format = useFormatter();
  const [form, setForm] = React.useState(() => ({
    // One credential set used for both IMAP and SMTP — every provider we'd
    // ship with reuses the mailbox login across both protocols.
    username: email?.imapUser || email?.smtpUser || "",
    password: "",
    imapHost: email?.imapHost || "",
    imapPort: String(email?.imapPort ?? 993),
    imapTls: email?.imapTls ?? true,
    smtpHost: email?.smtpHost || "",
    smtpPort: String(email?.smtpPort ?? 587),
    smtpTls: email?.smtpTls ?? true,
    fromAddress: email?.fromAddress || `careers@${workspace.domain || "example.com"}`,
    fromName: email?.fromName || currentUser?.name || "",
    enabled: email?.enabled ?? true,
  }));
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [polling, setPolling] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);

  function update(key: keyof typeof form, value: any) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    // API still takes imapUser/smtpUser + imapPassword/smtpPassword for
    // forward compatibility; the UI just sends the same value to both.
    const payload = {
      imapHost: form.imapHost,
      imapPort: Number(form.imapPort),
      imapUser: form.username,
      imapPassword: form.password,
      imapTls: form.imapTls,
      smtpHost: form.smtpHost,
      smtpPort: Number(form.smtpPort),
      smtpUser: form.username,
      smtpPassword: form.password,
      smtpTls: form.smtpTls,
      fromAddress: form.fromAddress,
      fromName: form.fromName,
      enabled: form.enabled,
    };
    const res = await fetch("/api/email-account", { method: "PUT", body: JSON.stringify(payload) });
    setSaving(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(json?.error || t("saveFailed"));
      return;
    }
    setStatus(t("saved"));
    setForm((s) => ({ ...s, password: "" }));
    router.refresh();
  }

  async function test() {
    setTesting(true);
    setStatus(null);
    const res = await fetch("/api/email-account/test", { method: "POST" });
    setTesting(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(json?.error || t("testFailed"));
      return;
    }
    if (json.imap && json.smtp) setStatus(t("testOk"));
    else setStatus(t("testPartial", { imap: json.imap ? "✓" : "✗", smtp: json.smtp ? "✓" : "✗" }) + (json.error ? ` — ${json.error}` : ""));
  }

  async function pollNow() {
    setPolling(true);
    setStatus(null);
    const res = await fetch("/api/email-account/poll", { method: "POST" });
    setPolling(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(json?.error || t("pollFailed"));
      return;
    }
    const counts = { checked: json.checked || 0, ingested: json.ingested || 0 };
    setStatus(
      json.since
        ? t("polledSince", { ...counts, since: format.dateTime(new Date(json.since), { dateStyle: "medium", timeStyle: "short" }) })
        : t("polled", counts),
    );
    router.refresh();
  }

  async function disconnect() {
    if (!confirm(t("confirmDisconnect"))) return;
    const res = await fetch("/api/email-account", { method: "DELETE" });
    if (res.ok) {
      setStatus(t("disconnected"));
      router.refresh();
    }
  }

  return (
    <>
      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 6 }}>{t("title")}</h2>
        <p className="muted" style={{ marginBottom: 14 }}>
          {t.rich("hint", { b: (c) => <b>{c}</b> })}
        </p>

        {email?.lastPolledAt && (
          <Chip dot="oklch(68% 0.16 150)" style={{ marginBottom: 14 }}>
            {t("lastPolled", { date: format.dateTime(new Date(email.lastPolledAt), { dateStyle: "medium", timeStyle: "short" }) })}
          </Chip>
        )}
        {email?.lastError && (
          <div className="chip chip-danger" style={{ marginBottom: 14 }}>
            {t("lastError", { error: email.lastError.slice(0, 200) })}
          </div>
        )}

        <div className="section-h" style={{ marginTop: 4, marginBottom: 8 }}>{t("fromIdentity")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label={t("fromName")}><input className="input" value={form.fromName} onChange={(e) => update("fromName", e.target.value)} placeholder={currentUser?.name || t("yourName")} /></Field>
          <Field label={t("fromAddress")}><input className="input" value={form.fromAddress} onChange={(e) => update("fromAddress", e.target.value)} placeholder={`careers@${workspace.domain}`} /></Field>
        </div>

        <div className="section-h" style={{ marginTop: 18, marginBottom: 8 }}>{t("login")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label={t("username")}>
            <input
              className="input"
              value={form.username}
              onChange={(e) => update("username", e.target.value)}
              placeholder="careers@yourdomain.com"
            />
          </Field>
          <Field label={t("password")}>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder={email?.imapHost ? t("passwordKeep") : t("appPassword")}
            />
          </Field>
        </div>
        <p className="tiny" style={{ marginTop: -2, marginBottom: 6, color: "var(--ink-2)" }}>
          {t.rich("loginHint", { b: (c) => <b>{c}</b> })}
        </p>

        <div className="section-h" style={{ marginTop: 18, marginBottom: 8 }}>{t("imap")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <Field label={t("host")}><input className="input" value={form.imapHost} onChange={(e) => update("imapHost", e.target.value)} placeholder="imap.gmail.com" /></Field>
          <Field label={t("port")}><input className="input" type="number" value={form.imapPort} onChange={(e) => update("imapPort", e.target.value)} /></Field>
        </div>
        <ToggleRow label={t("tls")} desc={t("tlsHint")} on={form.imapTls} onChange={(v) => update("imapTls", v)} />

        <div className="section-h" style={{ marginTop: 18, marginBottom: 8 }}>{t("smtp")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <Field label={t("host")}><input className="input" value={form.smtpHost} onChange={(e) => update("smtpHost", e.target.value)} placeholder="smtp.gmail.com" /></Field>
          <Field label={t("port")}><input className="input" type="number" value={form.smtpPort} onChange={(e) => update("smtpPort", e.target.value)} /></Field>
        </div>
        <ToggleRow label="STARTTLS" desc={t("starttlsHint")} on={form.smtpTls} onChange={(v) => update("smtpTls", v)} />

        <ToggleRow label={t("polling")} desc={t("pollingHint")} on={form.enabled} onChange={(v) => update("enabled", v)} />

        {status && (
          <div className="ai-card" style={{ marginTop: 14, fontSize: 13 }}>
            {status}
          </div>
        )}

        <div className="row" style={{ marginTop: 18, gap: 8, flexWrap: "wrap" }}>
          {email && <button className="btn btn-sm btn-ghost" onClick={disconnect}>{t("disconnect")}</button>}
          <span style={{ flex: 1 }} />
          <button className="btn" disabled={testing || !email} onClick={test}>{testing ? t("testing") : t("test")}</button>
          <button className="btn" disabled={polling || !email} onClick={pollNow}>{polling ? t("pollingNow") : t("pollNow")}</button>
          <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? tc("saving") : email ? t("update") : t("connect")}</button>
        </div>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>{t("matching.title")}</h2>
        <ul style={{ margin: "0 0 0 18px", padding: 0, fontSize: 13.5, color: "var(--ink-1)", lineHeight: 1.65 }}>
          <li>{t("matching.sender")}</li>
          <li>{t("matching.subject")}</li>
          <li>{t("matching.ignored")}</li>
          <li>{t("matching.threading")}</li>
          <li>{t("matching.outbound")}</li>
          <li>{t("matching.cadence", { seconds: Math.round(Number(process.env.NEXT_PUBLIC_EMAIL_POLL_INTERVAL_S || 180)) })}</li>
        </ul>
      </Glass>
    </>
  );
}

// ───────────────────────────────────────── Calendar ─────────────────────
function CalendarTab({ workspace, email, currentUser }: any) {
  const router = useRouter();
  const t = useTranslations("settings.calendar");
  const tc = useTranslations("common");
  // Connecting your own calendar is per-user, so every member sees that panel.
  // The workspace-wide bits (invite defaults, working hours) write through
  // admin-only APIs, so they're shown only to admins/owners.
  const admin = roleAtLeast(currentUser?.role || "member", "admin");
  const defaults = (workspace.defaults || {}) as Record<string, boolean>;
  // Default ON — opt-out, since most recruiters want the candidate to receive
  // a real calendar invite when they hit Schedule.
  const [sendInvites, setSendInvites] = React.useState<boolean>(defaults.sendInterviewInvites !== false);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        defaults: { ...defaults, sendInterviewInvites: sendInvites },
      }),
    });
    setSaving(false);
    if (res.ok) {
      setSavedAt(Date.now());
      router.refresh();
    }
  }

  const emailReady = !!email?.fromAddress && email?.enabled !== false;

  return (
    <>
      {admin && (
      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>{t("invites")}</h2>
        <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
          {t.rich("invitesHint", { mono: (c) => <span className="mono">{c}</span> })}
        </p>

        <ToggleRow
          label={t("sendDefault")}
          desc={t("sendDefaultHint")}
          on={sendInvites}
          onChange={setSendInvites}
        />

        <div className="ai-card" style={{ marginTop: 14 }}>
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <Icons.Calendar size={13} style={{ color: "var(--accent-solid)" }} />
            <strong style={{ fontSize: 13 }}>{t("delivery.title")}</strong>
          </div>
          <ul style={{ margin: "0 0 0 18px", padding: 0, fontSize: 13, color: "var(--ink-1)", lineHeight: 1.7 }}>
            <li>
              {t.rich("delivery.smtp", { link: (c) => <Link href="/settings?tab=email" style={{ color: "var(--accent-solid)" }}>{c}</Link> })}
              {emailReady ? (
                <Chip dot="oklch(68% 0.16 150)" style={{ marginLeft: 8 }}>{t("delivery.ready", { address: email.fromAddress })}</Chip>
              ) : (
                <Chip warn dot style={{ marginLeft: 8 }}>{t("delivery.notConfigured")}</Chip>
              )}
            </li>
            <li>{t.rich("delivery.rfc", { mono: (c) => <span className="mono">{c}</span> })}</li>
            <li>{t("delivery.cc")}</li>
            <li>{t.rich("delivery.url", { mono: (c) => <span className="mono">{c}</span> })}</li>
            <li>{t.rich("delivery.sequence", { mono: (c) => <span className="mono">{c}</span> })}</li>
          </ul>
        </div>
      </Glass>
      )}

      <CalendarAccountsPanel />

      {admin && <CalendarDefaultsPanel workspace={workspace} />}

      {admin && (
      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {savedAt && (
          <span className="tiny" style={{ color: "var(--accent-solid)" }}>
            {t("savedHint")}
          </span>
        )}
        <button className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? tc("saving") : t("saveChanges")}
        </button>
      </div>
      )}
    </>
  );
}

// ───── Calendar accounts panel ────────────────────────────────────────
type CalAccount = {
  id: string;
  provider: string;
  email: string;
  displayName: string | null;
  enabled: boolean;
  lastPolledAt: string | null;
  lastError: string | null;
  consecutiveErrors: number;
  defaultCalendarUrl: string | null;
  serverUrl: string | null;
  createdAt: string;
};

function CalendarAccountsPanel() {
  const router = useRouter();
  const t = useTranslations("settings.calendar");
  const format = useFormatter();
  const params = useSearchParams();
  const [accounts, setAccounts] = React.useState<CalAccount[]>([]);
  const [providers, setProviders] = React.useState<{ google: { configured: boolean }; microsoft: { configured: boolean } } | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [caldavOpen, setCaldavOpen] = React.useState(false);
  // Per-account sync state, keyed by account id. Stores the last result so
  // the user sees "12 events synced" or "error: …" inline on the row.
  const [syncState, setSyncState] = React.useState<Record<string, { busy?: boolean; count?: number; error?: string }>>({});

  const flash = params.get("calendar_connected") || params.get("calendar_error");

  const fetchAll = React.useCallback(async () => {
    const r = await fetch("/api/calendar/accounts");
    if (!r.ok) return;
    const j = await r.json();
    setAccounts(j.accounts || []);
    setProviders(j.providers || null);
    setLoaded(true);
  }, []);

  React.useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function disconnect(id: string) {
    if (!confirm(t("confirmDisconnect"))) return;
    await fetch(`/api/calendar/accounts/${id}`, { method: "DELETE" });
    await fetchAll();
  }

  async function syncNow(id: string) {
    setSyncState((s) => ({ ...s, [id]: { busy: true } }));
    try {
      const r = await fetch(`/api/calendar/accounts/${id}/sync`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) {
        setSyncState((s) => ({ ...s, [id]: { error: j.error || `HTTP ${r.status}` } }));
      } else {
        setSyncState((s) => ({ ...s, [id]: { count: j.count } }));
      }
      await fetchAll();
    } catch (e) {
      setSyncState((s) => ({ ...s, [id]: { error: (e as Error).message } }));
    }
  }

  return (
    <Glass className="card" style={{ padding: 24 }}>
      <h2 style={{ fontSize: 18, marginBottom: 4 }}>{t("accounts")}</h2>
      <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
        {t("accountsHint")}
      </p>

      {flash && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            background: params.get("calendar_connected") ? "color-mix(in oklab, oklch(70% 0.16 150) 18%, transparent)" : "color-mix(in oklab, oklch(70% 0.20 28) 18%, transparent)",
            border: "0.5px solid var(--line)",
            fontSize: 12.5,
            marginBottom: 12,
          }}
        >
          {params.get("calendar_connected")
            ? t("connectedFlash", { provider: params.get("calendar_connected") ?? "" })
            : t("connectFailed", { error: params.get("calendar_error") ?? "" })}
        </div>
      )}

      {loaded && accounts.length === 0 && (
        <p className="tiny" style={{ marginBottom: 12 }}>{t("noAccounts")}</p>
      )}

      {accounts.map((a) => {
        const st = syncState[a.id];
        return (
          <div
            key={a.id}
            style={{ padding: "10px 12px", border: "0.5px solid var(--line)", borderRadius: 10, marginBottom: 8 }}
          >
            <div className="row" style={{ gap: 12 }}>
              <ProviderIcon provider={a.provider} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{a.email}</div>
                <div className="tiny">
                  {a.provider} ·{" "}
                  {a.consecutiveErrors > 0 ? (
                    <span style={{ color: "oklch(58% 0.20 28)" }}>{t("syncError", { error: a.lastError || t("unknown") })}</span>
                  ) : a.lastPolledAt ? (
                    t("lastSync", { date: format.dateTime(new Date(a.lastPolledAt), { dateStyle: "medium", timeStyle: "short" }) })
                  ) : (
                    t("notSynced")
                  )}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => syncNow(a.id)} disabled={st?.busy}>
                <Icons.Refresh size={11} /> {st?.busy ? t("syncing") : t("syncNow")}
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => disconnect(a.id)}>
                {t("disconnect")}
              </button>
            </div>
            {(st?.count !== undefined || st?.error) && (
              <div
                className="tiny"
                style={{
                  marginTop: 8,
                  padding: "6px 8px",
                  borderRadius: 6,
                  background: st.error
                    ? "color-mix(in oklab, oklch(70% 0.20 28) 14%, transparent)"
                    : st.count
                      ? "color-mix(in oklab, oklch(70% 0.16 150) 14%, transparent)"
                      : "var(--glass-bg-faint)",
                }}
              >
                {st.error ? (
                  <>{t("syncFailed", { error: st.error })}</>
                ) : st.count ? (
                  <>{t("pulled", { count: st.count })}</>
                ) : (
                  <>{t("syncEmpty")}</>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {providers?.google.configured ? (
          <a className="btn" href="/api/calendar/oauth/google/start">
            <Icons.Globe size={12} /> {t("connectGoogle")}
          </a>
        ) : (
          <button className="btn" disabled title={t("envHint", { vars: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" })}>
            <Icons.Globe size={12} /> {t("connectGoogleOff")}
          </button>
        )}
        {providers?.microsoft.configured ? (
          <a className="btn" href="/api/calendar/oauth/microsoft/start">
            <Icons.Mail size={12} /> {t("connectMicrosoft")}
          </a>
        ) : (
          <button className="btn" disabled title={t("envHint", { vars: "MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET" })}>
            <Icons.Mail size={12} /> {t("connectMicrosoftOff")}
          </button>
        )}
        <button className="btn" onClick={() => setCaldavOpen((o) => !o)}>
          <Icons.AtSign size={12} /> {t("connectCaldav")}
        </button>
      </div>

      {caldavOpen && (
        <CalDavForm
          onDone={async () => {
            setCaldavOpen(false);
            await fetchAll();
            router.refresh();
          }}
        />
      )}
    </Glass>
  );
}

function ProviderIcon({ provider }: { provider: string }) {
  const map: Record<string, { icon: keyof typeof Icons; bg: string }> = {
    google: { icon: "Globe", bg: "oklch(70% 0.18 240)" },
    microsoft: { icon: "Mail", bg: "oklch(60% 0.16 250)" },
    caldav: { icon: "AtSign", bg: "oklch(60% 0.14 150)" },
  };
  const cfg = map[provider] || { icon: "Calendar", bg: "var(--ink-3)" };
  const Ico = Icons[cfg.icon];
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: `color-mix(in oklab, ${cfg.bg} 25%, transparent)`,
        color: cfg.bg,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ico size={14} />
    </div>
  );
}

function CalDavForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("settings.calendar");
  const tc = useTranslations("common");
  const [serverUrl, setServerUrl] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [calendars, setCalendars] = React.useState<{ url: string; displayName: string }[] | null>(null);
  const [pickedUrl, setPickedUrl] = React.useState("");

  const presets = [
    { label: "iCloud", url: "https://caldav.icloud.com" },
    { label: "Fastmail", url: "https://caldav.fastmail.com" },
    { label: "Nextcloud", url: "https://" },
    { label: t("caldav.custom"), url: "" },
  ];

  async function probe(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/calendar/caldav", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUrl, email, password }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || t("caldav.connectFailed"));
      } else {
        setCalendars(j.calendars || []);
        setPickedUrl(j.calendars?.[0]?.url || "");
      }
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/calendar/caldav", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUrl, email, password, defaultCalendarUrl: pickedUrl }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || t("caldav.saveFailed"));
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Glass faint style={{ padding: 14, borderRadius: 10, marginTop: 12 }}>
      <div className="section-h" style={{ marginBottom: 6 }}>{t("caldav.title")}</div>
      <div className="row" style={{ gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {presets.map((p) => (
          <button
            key={p.label}
            className="btn btn-sm"
            onClick={() => setServerUrl(p.url)}
            type="button"
            style={{ height: 26 }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <form onSubmit={probe}>
        <input className="input" placeholder={t("caldav.serverUrl")} value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} required style={{ marginBottom: 6 }} />
        <input className="input" placeholder={t("caldav.username")} value={email} onChange={(e) => setEmail(e.target.value)} required style={{ marginBottom: 6 }} />
        <input className="input" type="password" placeholder={t("caldav.password")} value={password} onChange={(e) => setPassword(e.target.value)} required style={{ marginBottom: 6 }} />
        {error && (
          <div style={{ color: "oklch(58% 0.20 28)", fontSize: 12, marginBottom: 6 }}>{error}</div>
        )}
        {!calendars ? (
          <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
            {busy ? t("caldav.connecting") : t("caldav.test")}
          </button>
        ) : (
          <>
            <p className="tiny" style={{ marginBottom: 6 }}>{t("caldav.pick")}</p>
            <select className="select" value={pickedUrl} onChange={(e) => setPickedUrl(e.target.value)} style={{ marginBottom: 6 }}>
              {calendars.map((c) => (
                <option key={c.url} value={c.url}>
                  {c.displayName}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={save}>
              {busy ? tc("saving") : t("caldav.save")}
            </button>
          </>
        )}
      </form>
    </Glass>
  );
}

function CalendarDefaultsPanel({ workspace }: { workspace: any }) {
  const t = useTranslations("settings.calendar");
  const tc = useTranslations("common");
  const cs: any = workspace.calendarSettings || {};
  const [start, setStart] = React.useState(cs.workHours?.start || "08:00");
  const [end, setEnd] = React.useState(cs.workHours?.end || "19:00");
  const [tz, setTz] = React.useState(cs.timezone || workspace.timezone || "UTC");
  const [defaultKind, setDefaultKind] = React.useState(cs.defaultInterviewKind || "video");
  const [busy, setBusy] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  async function save() {
    setBusy(true);
    const r = await fetch("/api/calendar/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workHoursStart: start,
        workHoursEnd: end,
        timezone: tz,
        defaultInterviewKind: defaultKind,
      }),
    });
    setBusy(false);
    if (r.ok) setSavedAt(Date.now());
  }

  return (
    <Glass className="card" style={{ padding: 24 }}>
      <h2 style={{ fontSize: 18, marginBottom: 4 }}>{t("defaults")}</h2>
      <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
        {t("defaultsHint")}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
        <label style={{ display: "block" }}>
          <div className="tiny" style={{ marginBottom: 4 }}>{t("dayStarts")}</div>
          <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label style={{ display: "block" }}>
          <div className="tiny" style={{ marginBottom: 4 }}>{t("dayEnds")}</div>
          <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label style={{ display: "block" }}>
          <div className="tiny" style={{ marginBottom: 4 }}>{t("defaultKind")}</div>
          <select className="select" value={defaultKind} onChange={(e) => setDefaultKind(e.target.value as any)}>
            <option value="phone">{tc("interviewKinds.phone")}</option>
            <option value="video">{tc("interviewKinds.video")}</option>
            <option value="onsite">{tc("interviewKinds.onsite")}</option>
            <option value="panel">{tc("interviewKinds.panel")}</option>
          </select>
        </label>
        <label style={{ display: "block" }}>
          <div className="tiny" style={{ marginBottom: 4 }}>{t("timezone")}</div>
          <input className="input" value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Europe/Berlin" />
        </label>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {savedAt && <span className="tiny" style={{ color: "var(--accent-solid)" }}>{tc("saved")}</span>}
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? tc("saving") : t("saveDefaults")}
        </button>
      </div>
    </Glass>
  );
}

// ───────────────────────────────────────── Appearance ─────────────────────
function AppearanceTab({ currentUser, workspace }: any) {
  const router = useRouter();
  const t = useTranslations("settings");
  const ta = useTranslations("settings.appearance");
  const [locale, setLocale] = React.useState<string>(currentUser.locale ?? "");
  const [prefs, setPrefs] = React.useState({
    theme: currentUser.theme as "light" | "dark",
    density: currentUser.density as "compact" | "cozy",
    accent: currentUser.accent as keyof typeof ACCENTS,
    glassIntensity: currentUser.glassIntensity as number,
  });

  React.useEffect(() => { applyPrefs(prefs); }, [prefs]);

  async function update<T extends keyof typeof prefs>(key: T, value: typeof prefs[T]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    await fetch("/api/preferences", { method: "POST", body: JSON.stringify({ [key]: value }) });
  }

  async function updateLocale(value: string) {
    setLocale(value);
    await fetch("/api/preferences", { method: "POST", body: JSON.stringify({ locale: value || null }) });
    // The language is resolved server-side, so re-render to pick up the new messages.
    router.refresh();
  }

  const workspaceLocale: Locale = isLocale(workspace.locale) ? workspace.locale : DEFAULT_LOCALE;

  return (
    <>
      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>{t("language.title")}</h2>
        <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>{t("language.userHint")}</p>
        <div style={{ maxWidth: 320 }}>
          <select className="select" value={locale} onChange={(e) => updateLocale(e.target.value)}>
            <option value="">{t("language.useWorkspaceDefault", { language: LOCALE_LABELS[workspaceLocale] })}</option>
            {LOCALES.map((l) => (
              <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
            ))}
          </select>
        </div>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>{ta("mode")}</h2>
        <div className="row" style={{ gap: 12 }}>
          {(["light", "dark"] as const).map((m) => (
            <button key={m} className={`btn ${prefs.theme === m ? "btn-primary" : ""}`} onClick={() => update("theme", m)} style={{ flex: 1, height: 60 }}>
              {m === "dark" ? <Icons.Moon size={14}/> : <Icons.Sun size={14}/>}
              <span>{ta(`modes.${m}`)}</span>
            </button>
          ))}
        </div>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>{ta("accent")}</h2>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          {Object.entries(ACCENTS).map(([k, v]) => (
            <button key={k} className={`btn ${prefs.accent === k ? "btn-primary" : ""}`} onClick={() => update("accent", k as any)} style={{ height: 44, padding: "0 14px" }}>
              <span style={{ width: 14, height: 14, borderRadius: 4, background: `linear-gradient(135deg, ${v.a1}, ${v.a2})` }} />
              {ta(`accents.${k as keyof typeof ACCENTS}`)}
            </button>
          ))}
        </div>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>{ta("density")}</h2>
        <div className="row" style={{ gap: 12 }}>
          {(["compact", "cozy"] as const).map((d) => (
            <button key={d} className={`btn ${prefs.density === d ? "btn-primary" : ""}`} onClick={() => update("density", d)} style={{ flex: 1 }}>
              {ta(`densities.${d}`)}
            </button>
          ))}
        </div>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>{ta("glass")} <span className="tiny muted">{prefs.glassIntensity.toFixed(2)}×</span></h2>
        <input type="range" min={0.1} max={1.4} step={0.05} value={prefs.glassIntensity} onChange={(e) => update("glassIntensity", parseFloat(e.target.value))} style={{ width: "100%" }} />
      </Glass>
    </>
  );
}

// ───────────────────────────────────────── Cookies ────────────────────
// Add / edit / delete the scripts that fire on the public career site,
// grouped into the three consent categories. The banner shown to
// candidates is governed by /cookies and the CookieConsent component.
function CookiesTab({ workspace }: { workspace: { cookieConfig: CookieConfig } }) {
  const router = useRouter();
  const t = useTranslations("settings.cookies");
  const tcat = useTranslations("consent.categories");
  const tc = useTranslations("common");
  const format = useFormatter();
  const [config, setConfig] = React.useState<CookieConfig>(workspace.cookieConfig);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [editing, setEditing] = React.useState<CookieScript | null>(null);

  async function save(next: CookieConfig) {
    setSaving(true);
    const res = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cookieConfig: next }),
    });
    setSaving(false);
    if (res.ok) {
      setConfig(next);
      setSavedAt(Date.now());
      router.refresh();
    }
  }

  function upsert(script: CookieScript) {
    const exists = config.scripts.some((s) => s.id === script.id);
    const scripts = exists
      ? config.scripts.map((s) => (s.id === script.id ? script : s))
      : [...config.scripts, script];
    save({ ...config, scripts });
    setEditing(null);
  }

  function remove(id: string) {
    save({ ...config, scripts: config.scripts.filter((s) => s.id !== id) });
  }

  function toggleScript(id: string, enabled: boolean) {
    save({ ...config, scripts: config.scripts.map((s) => (s.id === id ? { ...s, enabled } : s)) });
  }

  return (
    <>
      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>{t("title")}</h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
          {t("hint")}
        </p>

        <ToggleRow
          label={t("banner")}
          desc={t("bannerHint")}
          on={config.enabled}
          onChange={(v) => save({ ...config, enabled: v })}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
          <Field label={t("bannerTitle")}>
            <input
              className="input"
              value={config.banner?.title || ""}
              placeholder={t("bannerTitlePlaceholder")}
              onChange={(e) => setConfig({ ...config, banner: { ...config.banner, title: e.target.value } })}
              onBlur={() => save(config)}
            />
          </Field>
          <Field label={t("bannerMessage")}>
            <input
              className="input"
              value={config.banner?.message || ""}
              placeholder={t("bannerMessagePlaceholder")}
              onChange={(e) => setConfig({ ...config, banner: { ...config.banner, message: e.target.value } })}
              onBlur={() => save(config)}
            />
          </Field>
        </div>
      </Glass>

      {CATEGORY_ORDER.map((cat) => {
        const inCat = config.scripts.filter((s) => s.category === cat);
        return (
          <Glass key={cat} className="card" style={{ padding: 24 }}>
            <div className="row" style={{ alignItems: "baseline", marginBottom: 4 }}>
              <h2 style={{ flex: 1, fontSize: 18 }}>{tcat(`${cat}.title`)}</h2>
              <Chip>
                {t("scriptCount", { count: inCat.length })}
              </Chip>
            </div>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>{tcat(`${cat}.blurb`)}</p>

            {inCat.length === 0 ? (
              <div className="tiny" style={{ padding: "16px 0", color: "var(--ink-2)" }}>
                {t("empty")}
              </div>
            ) : (
              <div className="col" style={{ gap: 8 }}>
                {inCat.map((s) => (
                  <div
                    key={s.id}
                    className="row"
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "0.5px solid var(--line)",
                      background: "var(--glass-bg-faint)",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row" style={{ gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink-0)" }}>{s.name}</span>
                        {s.provider && <span className="tiny" style={{ color: "var(--ink-2)" }}>· {s.provider}</span>}
                      </div>
                      {s.description && (
                        <div className="tiny" style={{ marginBottom: 4, lineHeight: 1.45 }}>{s.description}</div>
                      )}
                      <div className="tiny mono" style={{ color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.src || (s.code ? t("inline", { chars: s.code.length }) : "—")}
                      </div>
                    </div>
                    <button className={`switch ${s.enabled ? "on" : ""}`} onClick={() => toggleScript(s.id, !s.enabled)} />
                    <button className="btn btn-sm" onClick={() => setEditing(s)}>{tc("edit")}</button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(s.id)}>{tc("delete")}</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <button
                className="btn btn-sm"
                onClick={() =>
                  setEditing({
                    id: `cs_${Math.random().toString(36).slice(2, 10)}`,
                    category: cat,
                    name: "",
                    provider: "",
                    description: "",
                    src: "",
                    code: "",
                    enabled: true,
                  })
                }
              >
                <Icons.Plus size={12} stroke={2} /> {t("addScript")}
              </button>
            </div>
          </Glass>
        );
      })}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {savedAt && <span className="tiny" style={{ color: "var(--ink-2)" }}>{t("savedAt", { time: format.dateTime(new Date(savedAt), { timeStyle: "medium" }) })}</span>}
        {saving && <span className="tiny">{tc("saving")}</span>}
      </div>

      {editing && (
        <CookieScriptEditor
          script={editing}
          onCancel={() => setEditing(null)}
          onSave={(s) => upsert(s)}
        />
      )}
    </>
  );
}

function CookieScriptEditor({
  script,
  onCancel,
  onSave,
}: {
  script: CookieScript;
  onCancel: () => void;
  onSave: (script: CookieScript) => void;
}) {
  const t = useTranslations("settings.cookies");
  const tcat = useTranslations("consent.categories");
  const tc = useTranslations("common");
  const [draft, setDraft] = React.useState<CookieScript>(script);
  const canSave = draft.name.trim().length > 0 && (!!draft.src?.trim() || !!draft.code?.trim());

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in oklab, var(--bg-0) 60%, transparent)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <Glass strong style={{ width: "100%", maxWidth: 560, padding: 22, borderRadius: 18 }}>
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ flex: 1, fontSize: 17 }}>{script.name ? t("editScript") : t("addScript")}</h2>
          <button className="btn btn-sm btn-ghost btn-icon" onClick={onCancel} aria-label={tc("close")}>
            <Icons.X size={14} stroke={2} />
          </button>
        </div>

        <Field label={t("category")}>
          <select
            className="select"
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value as CookieCategory })}
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {tcat(`${c}.title`)}
              </option>
            ))}
          </select>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={t("name")}>
            <input
              className="input"
              value={draft.name}
              placeholder="Google Analytics"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label={t("provider")}>
            <input
              className="input"
              value={draft.provider || ""}
              placeholder="Google"
              onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
            />
          </Field>
        </div>

        <Field label={t("description")}>
          <input
            className="input"
            value={draft.description || ""}
            placeholder={t("descriptionPlaceholder")}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </Field>

        <Field label={t("src")}>
          <input
            className="input mono"
            value={draft.src || ""}
            placeholder="https://www.googletagmanager.com/gtag/js?id=G-XXXX"
            onChange={(e) => setDraft({ ...draft, src: e.target.value })}
          />
        </Field>

        <Field label={t("code")}>
          <textarea
            className="textarea mono"
            rows={5}
            value={draft.code || ""}
            placeholder={"window.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', 'G-XXXX');"}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            style={{ height: "auto", padding: 10, fontSize: 12, lineHeight: 1.5 }}
          />
        </Field>

        <div className="tiny" style={{ color: "var(--ink-2)", marginTop: 4, marginBottom: 14, lineHeight: 1.5 }}>
          {t.rich("loadHint", { category: tcat(`${draft.category}.title`), b: (c) => <b>{c}</b> })}
        </div>

        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-sm" onClick={onCancel}>{tc("cancel")}</button>
          <button
            className="btn btn-sm btn-primary"
            disabled={!canSave}
            onClick={() =>
              onSave({
                ...draft,
                name: draft.name.trim(),
                provider: draft.provider?.trim() || undefined,
                description: draft.description?.trim() || undefined,
                src: draft.src?.trim() || undefined,
                code: draft.code?.trim() || undefined,
              })
            }
          >
            {script.name ? t("saveChanges") : t("addScript")}
          </button>
        </div>
      </Glass>
    </div>
  );
}

// ───────────────────────────────────────── Danger ─────────────────────
function DangerTab({ workspace, currentUser }: any) {
  const router = useRouter();
  const t = useTranslations("settings.danger");
  const [confirm, setConfirm] = React.useState("");
  const [purging, setPurging] = React.useState<"idle" | "busy" | "ok" | "err">("idle");
  // Deleting the workspace is owner-only (ROLES.md §2.1 / §5). Admins still get
  // export + recap-cache purge, but never see the destroy-workspace control.
  const isOwner = currentUser?.role === "owner";

  async function exportData() {
    window.open("/api/workspace/export", "_blank");
  }
  async function deleteWorkspace() {
    if (confirm !== workspace.slug) return;
    const r = await fetch("/api/workspace", { method: "DELETE" });
    if (r.ok) router.push("/onboarding/new-workspace");
  }
  async function purgeRecapCache() {
    setPurging("busy");
    const r = await fetch("/api/recap/purge", { method: "POST" });
    setPurging(r.ok ? "ok" : "err");
    setTimeout(() => setPurging("idle"), 3000);
  }

  return (
    <Glass className="card" style={{ padding: 24, borderColor: "color-mix(in oklab, oklch(58% 0.2 28) 30%, var(--glass-border))" }}>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>{t("title")}</h2>

      <div className="row" style={{ padding: "12px 0", borderBottom: "0.5px solid var(--line)" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500 }}>{t("export")}</div>
          <div className="tiny">{t("exportHint")}</div>
        </div>
        <button className="btn" onClick={exportData}>{t("exportButton")}</button>
      </div>

      {/* Recap cache — non-destructive but worth surfacing here for the
          "I changed thresholds and want a fresh build" workflow per
          RECAP_FEATURE.md §11.7. */}
      <div className="row" style={{ padding: "12px 0", borderBottom: "0.5px solid var(--line)" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500 }}>{t("purge")}</div>
          <div className="tiny">{t("purgeHint")}</div>
        </div>
        <button className="btn" onClick={purgeRecapCache} disabled={purging === "busy"}>
          {purging === "busy" ? t("purging") : purging === "ok" ? t("purged") : purging === "err" ? t("purgeFailed") : t("purgeButton")}
        </button>
      </div>

      {isOwner && (
        <div className="row" style={{ padding: "12px 0", borderBottom: "0.5px solid var(--line)", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, color: "oklch(58% 0.2 28)" }}>{t("delete")}</div>
            <div className="tiny">{t("deleteHint")}</div>
            <input className="input" placeholder={workspace.slug} value={confirm} onChange={(e) => setConfirm(e.target.value)} style={{ marginTop: 10, maxWidth: 320 }} />
          </div>
          <button className="btn btn-danger" disabled={confirm !== workspace.slug} onClick={deleteWorkspace}>{t("deleteButton")}</button>
        </div>
      )}
    </Glass>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row" style={{ padding: "10px 0", gap: 14, borderBottom: "0.5px solid var(--line)" }}>
      <div style={{ width: 160, fontSize: 12.5, color: "var(--ink-2)" }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span className="label" style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}
