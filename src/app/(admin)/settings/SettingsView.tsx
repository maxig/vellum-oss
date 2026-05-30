// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Glass, Chip, AIPill, Icons, WorkspaceMark } from "@/components/primitives";
import { ACCENTS, AI_PROVIDERS, AI_FEATURES } from "@/lib/design";
import { applyPrefs } from "@/components/ThemeBoot";
import Wysiwyg from "@/components/Wysiwyg";
import {
  CATEGORY_LABELS,
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
  | "email"
  | "calendar"
  | "appearance"
  | "cookies"
  | "danger";

const TABS: { id: Tab; label: string; icon: keyof typeof Icons }[] = [
  { id: "workspace",  label: "Workspace",         icon: "Settings" },
  { id: "appearance", label: "Appearance",        icon: "Sun" },
  { id: "career",     label: "Career site",       icon: "Globe" },
  { id: "ai",         label: "AI & integrations", icon: "Sparkle" },
  { id: "team",       label: "Team & roles",      icon: "Users" },
  { id: "email",      label: "Email",             icon: "Mail" },
  { id: "calendar",   label: "Calendar",          icon: "Calendar" },
  { id: "cookies",    label: "Cookies & consent", icon: "Lock" },
  { id: "danger",     label: "Danger zone",       icon: "Trash" },
];

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
    signature: string;
    defaults: Record<string, boolean>;
    cookieConfig: CookieConfig;
  };
  currentUser: { id: string; name: string | null; email: string; role: string; theme: string; density: string; accent: string; glassIntensity: number };
  careerSite: any;
  ai: any;
  email: any;
  members: { id: string; role: string; user: { id: string; name: string | null; email: string } }[];
  invites: { id: string; email: string; role: string; token: string; expiresAt: string }[];
  publicDomain: string;
  publicScheme: string;
}) {
  const router = useRouter();
  const tab = (TABS.find((t) => t.id === props.tab)?.id || "workspace") as Tab;
  const inviteLinkBase = `${props.publicScheme}://${props.publicDomain}/invite/`;

  return (
    <div className="page settings-page">
      <div className="settings-shell">
        <nav className="settings-nav">
          <div className="section-h" style={{ padding: "6px 10px", marginBottom: 8 }}>Settings</div>
          {TABS.map((t) => {
            const I = Icons[t.icon];
            return (
              <Link key={t.id} href={`/settings?tab=${t.id}`} className={`nav-item ${tab === t.id ? "active" : ""}`}>
                <I size={15} className="nav-icon" />
                <span>{t.label}</span>
              </Link>
            );
          })}

          <Glass faint style={{ padding: 12, borderRadius: 10, marginTop: 18 }}>
            <div className="row" style={{ gap: 6, marginBottom: 6 }}>
              <Icons.Github size={12} style={{ color: "var(--ink-2)" }} />
              <span className="tiny" style={{ fontWeight: 500 }}>Open source</span>
            </div>
            <div className="tiny" style={{ lineHeight: 1.45 }}>
              Vellum is self-hosted and free forever.
            </div>
          </Glass>
        </nav>

        <div className="col" style={{ gap: 14, minWidth: 0 }}>
          {tab === "workspace"  && <WorkspaceTab {...props} />}
          {tab === "career"     && <CareerTab {...props} />}
          {tab === "team"       && <TeamTab {...props} inviteLinkBase={inviteLinkBase} />}
          {tab === "ai"         && <AITab {...props} />}
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
const CURRENCIES = [
  { code: "EUR", label: "Euro (€)" },
  { code: "USD", label: "US Dollar ($)" },
  { code: "GBP", label: "British Pound (£)" },
  { code: "CHF", label: "Swiss Franc (CHF)" },
  { code: "SEK", label: "Swedish Krona (kr)" },
  { code: "NOK", label: "Norwegian Krone (kr)" },
  { code: "DKK", label: "Danish Krone (kr)" },
  { code: "PLN", label: "Polish Złoty (zł)" },
  { code: "CAD", label: "Canadian Dollar (CA$)" },
  { code: "AUD", label: "Australian Dollar (A$)" },
  { code: "JPY", label: "Japanese Yen (¥)" },
  { code: "INR", label: "Indian Rupee (₹)" },
  { code: "BRL", label: "Brazilian Real (R$)" },
  { code: "MXN", label: "Mexican Peso (MX$)" },
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
  const [name, setName] = React.useState<string>(workspace.name);
  const [domain, setDomain] = React.useState<string>(workspace.domain);
  const [color, setColor] = React.useState<string>(workspace.color);
  const [timezone, setTimezone] = React.useState<string>(workspace.timezone || "Europe/Berlin");
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
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>Identity</h2>
        <p className="muted" style={{ marginBottom: 18 }}>Branding and high-level workspace metadata.</p>
        <div className="row" style={{ gap: 16, marginBottom: 14 }}>
          <WorkspaceMark workspace={{ name, color }} size={48} />
          <div style={{ flex: 1 }}>
            <label className="label">Workspace name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div className="row" style={{ gap: 14, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label className="label">Primary email domain</label>
            <input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">Time zone</label>
            <select className="select" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {!TIMEZONES.includes(timezone) && <option value={timezone}>{timezone}</option>}
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Color</label>
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
          <label className="label">Workspace ID <span className="tiny muted">· used in API calls</span></label>
          <input
            className="input mono"
            readOnly
            value={workspace.id}
            style={{ background: "var(--glass-bg-faint)", color: "var(--ink-2)" }}
          />
        </div>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>Defaults</h2>
        <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
          Sensible starting points for new jobs and outbound messages.
        </p>
        <div style={{ marginBottom: 6 }}>
          <label className="label">Default reply signature</label>
          <textarea
            className="input autogrow"
            data-max-lines="8"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder={`Warmly,\n${workspace.name}`}
            style={{ fontFamily: "inherit" }}
          />
          <p className="tiny muted" style={{ marginTop: 4 }}>
            Appears as a pre-filled signature when composing replies in the inbox.
          </p>
        </div>
        <ToggleRow
          label="Auto-send application confirmations"
          desc="Email candidates within 60s of applying. Requires connected SMTP."
          on={autoSend}
          onChange={setAutoSend}
        />
        <ToggleRow
          label="AI rejection drafts"
          desc="Suggest a kind, role-specific rejection note for HR review."
          on={aiRejection}
          onChange={setAiRejection}
        />
        <ToggleRow
          label="Show salary publicly by default"
          desc="Candidates see compensation in every job listing."
          on={showSalary}
          onChange={setShowSalary}
        />
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>Currency</h2>
        <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
          Used for every salary input across the app and for compensation shown on the public career site.
        </p>
        <div style={{ maxWidth: 320 }}>
          <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </div>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>Departments</h2>
        <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
          The departments your team hires for. Shown as a dropdown in the New job wizard and as filter chips on the career site.
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
                  aria-label={`Remove ${d}`}
                  title={`Remove ${d}`}
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
            placeholder="e.g. Engineering"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDept();
              }
            }}
          />
          <button className="btn" type="button" onClick={addDept} disabled={!newDept.trim()}>
            <Icons.Plus size={12} stroke={2} /> Add
          </button>
        </div>
      </Glass>

      <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
        {savedAt && (
          <span className="tiny" style={{ color: "var(--accent-solid)" }}>
            Saved · changes apply across the workspace
          </span>
        )}
        <button className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save all changes"}
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
  const [state, setState] = React.useState(() => ({
    brand: careerSite?.brand || { name: workspace.name, domain: `careers.${workspace.domain}` },
    hero: careerSite?.hero || { eyebrow: "We're hiring across {n} roles", headline_1: "Help us make great things", headline_2: "feel obvious.", lede: "<p>We're a small team building thoughtful software.</p>", cta_primary: "See open roles", cta_secondary: "Meet the team" },
    about: careerSite?.about || { eyebrow: "About us", headline: "We build excellent software.", body_1: "", body_2: "", stats: [{n:"",l:""},{n:"",l:""},{n:"",l:""},{n:"",l:""}] },
    values: careerSite?.values || [],
    offices: (careerSite?.offices as Office[]) || [],
    stories: (careerSite?.stories as Story[]) || [],
    cta: careerSite?.cta || { headline: "Don't see your role?", body: "<p>Tell us what you'd want to work on.</p>", button_1: "Send us a note", button_2: "Read our handbook" },
    footer: careerSite?.footer || { email: `careers@${workspace.domain}`, company: `© ${workspace.name}` },
  }));
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/career-site", { method: "PATCH", body: JSON.stringify(state) });
    setSaving(false);
    if (res.ok) {
      setSavedAt(Date.now());
      router.refresh();
    }
  }

  const apex = publicDomain;
  const publicUrl = `${publicScheme}://${workspace.slug}.${apex}`;

  return (
    <>
      <Glass className="card" style={{ padding: 24 }}>
        <div className="row" style={{ alignItems: "baseline", marginBottom: 10 }}>
          <h2 style={{ flex: 1, fontSize: 18 }}>Domain &amp; brand</h2>
          <a className="btn btn-sm" href={publicUrl} target="_blank" rel="noreferrer">Open site <Icons.ArrowUpRight size={11}/></a>
        </div>
        <Row label="Public URL"><a className="mono" href={publicUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent-solid)" }}>{publicUrl}</a></Row>
        <Row label="Custom CNAME">
          <div className="col" style={{ gap: 6, alignItems: "flex-start" }}>
            <div className="row" style={{ gap: 6, fontSize: 12.5 }}>
              <span className="chip">CNAME</span>
              <span className="mono">careers.{workspace.domain}</span>
              <Icons.ArrowRight size={12} />
              <span className="mono">{workspace.slug}.{apex}</span>
            </div>
            <Chip warn dot>Add this DNS record at your registrar, then click verify</Chip>
          </div>
        </Row>
        <Row label="Company name">
          <input className="input" value={state.brand.name} onChange={(e) => setState({ ...state, brand: { ...state.brand, name: e.target.value } })} />
        </Row>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Hero</h2>
        <Row label="Eyebrow">
          <input className="input" value={state.hero.eyebrow} onChange={(e) => setState({ ...state, hero: { ...state.hero, eyebrow: e.target.value } })} />
        </Row>
        <Row label="Headline (1)">
          <input className="input" value={state.hero.headline_1} onChange={(e) => setState({ ...state, hero: { ...state.hero, headline_1: e.target.value } })} />
        </Row>
        <Row label="Headline (2 · italic)">
          <input className="input" value={state.hero.headline_2} onChange={(e) => setState({ ...state, hero: { ...state.hero, headline_2: e.target.value } })} />
        </Row>
        <Row label="Lede">
          <Wysiwyg
            value={state.hero.lede || ""}
            onChange={(html) => setState({ ...state, hero: { ...state.hero, lede: html } })}
            placeholder="A sentence that introduces the company…"
            minHeight={80}
          />
        </Row>
        <Row label="Primary CTA"><input className="input" value={state.hero.cta_primary} onChange={(e) => setState({ ...state, hero: { ...state.hero, cta_primary: e.target.value } })}/></Row>
        <Row label="Secondary CTA"><input className="input" value={state.hero.cta_secondary} onChange={(e) => setState({ ...state, hero: { ...state.hero, cta_secondary: e.target.value } })}/></Row>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>About</h2>
        <Row label="Headline"><input className="input" value={state.about.headline} onChange={(e) => setState({ ...state, about: { ...state.about, headline: e.target.value } })}/></Row>
        <Row label="Paragraph 1">
          <Wysiwyg
            value={state.about.body_1 || ""}
            onChange={(html) => setState({ ...state, about: { ...state.about, body_1: html } })}
            placeholder="What you do, in plain language."
            minHeight={100}
          />
        </Row>
        <Row label="Paragraph 2">
          <Wysiwyg
            value={state.about.body_2 || ""}
            onChange={(html) => setState({ ...state, about: { ...state.about, body_2: html } })}
            placeholder="How you work, why it's interesting."
            minHeight={100}
          />
        </Row>
        <div className="section-h" style={{ marginTop: 14, marginBottom: 8 }}>Stats (4)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {state.about.stats.map((s: any, i: number) => (
            <div key={i} className="col" style={{ gap: 6 }}>
              <input className="input" placeholder="Value (e.g. 38)" value={s.n} onChange={(e) => {
                const stats = [...state.about.stats]; stats[i] = { ...s, n: e.target.value };
                setState({ ...state, about: { ...state.about, stats } });
              }}/>
              <input className="input" placeholder="Label (e.g. people)" value={s.l} onChange={(e) => {
                const stats = [...state.about.stats]; stats[i] = { ...s, l: e.target.value };
                setState({ ...state, about: { ...state.about, stats } });
              }}/>
            </div>
          ))}
        </div>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Values</h2>
        {state.values.map((v: any, i: number) => (
          <div key={i} className="row" style={{ gap: 10, marginBottom: 10 }}>
            <input className="input" style={{ flex: 1 }} placeholder="Title" value={v.t} onChange={(e) => {
              const values = [...state.values]; values[i] = { ...v, t: e.target.value };
              setState({ ...state, values });
            }}/>
            <input className="input" style={{ flex: 2 }} placeholder="One-sentence description" value={v.b} onChange={(e) => {
              const values = [...state.values]; values[i] = { ...v, b: e.target.value };
              setState({ ...state, values });
            }}/>
            <button className="btn btn-sm btn-ghost" onClick={() => setState({ ...state, values: state.values.filter((_: any, j: number) => j !== i) })}>
              <Icons.Trash size={13}/>
            </button>
          </div>
        ))}
        <button className="btn btn-sm" onClick={() => setState({ ...state, values: [...state.values, { t: "New value", b: "" }] })}>
          <Icons.Plus size={12}/> Add value
        </button>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <div className="row" style={{ alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={{ flex: 1, fontSize: 18 }}>Offices</h2>
          <span className="tiny">Shown on the public career site below the about block.</span>
        </div>
        {state.offices.length === 0 && (
          <p className="muted" style={{ marginBottom: 12 }}>No offices yet — add the cities you hire from.</p>
        )}
        {state.offices.map((o: Office, i: number) => (
          <div key={i} className="row" style={{ gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
            <input className="input" placeholder="City" style={{ flex: 1 }} value={o.city} onChange={(e) => updateAt(state, setState, "offices", i, { ...o, city: e.target.value })} />
            <input className="input" placeholder="Country" style={{ flex: 1 }} value={o.country} onChange={(e) => updateAt(state, setState, "offices", i, { ...o, country: e.target.value })} />
            <input className="input" placeholder="Address" style={{ flex: 2 }} value={o.address} onChange={(e) => updateAt(state, setState, "offices", i, { ...o, address: e.target.value })} />
            <input className="input" placeholder="# people" style={{ width: 90 }} value={o.employees} onChange={(e) => updateAt(state, setState, "offices", i, { ...o, employees: e.target.value })} />
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeAt(state, setState, "offices", i)}>
              <Icons.Trash size={13} />
            </button>
          </div>
        ))}
        <button className="btn btn-sm" onClick={() => setState({ ...state, offices: [...state.offices, { city: "", country: "", address: "", employees: "" }] })}>
          <Icons.Plus size={12} /> Add office
        </button>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <div className="row" style={{ alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={{ flex: 1, fontSize: 18 }}>Team stories</h2>
          <span className="tiny">Each story shows on the public site with a quote and a portrait.</span>
        </div>
        {state.stories.length === 0 && (
          <p className="muted" style={{ marginBottom: 12 }}>Share a few sentences from people on the team.</p>
        )}
        {state.stories.map((s: Story, i: number) => (
          <div key={i} className="col" style={{ gap: 8, marginBottom: 16, padding: 14, borderRadius: 10, background: "var(--glass-bg-faint)", border: "0.5px solid var(--line)" }}>
            <div className="row" style={{ gap: 10 }}>
              <input className="input" placeholder="Name" style={{ flex: 1 }} value={s.name} onChange={(e) => updateAt(state, setState, "stories", i, { ...s, name: e.target.value })} />
              <input className="input" placeholder="Role" style={{ flex: 1 }} value={s.role} onChange={(e) => updateAt(state, setState, "stories", i, { ...s, role: e.target.value })} />
              <input className="input" placeholder="Tenure (e.g. 2 yrs)" style={{ flex: 1 }} value={s.years} onChange={(e) => updateAt(state, setState, "stories", i, { ...s, years: e.target.value })} />
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeAt(state, setState, "stories", i)}>
                <Icons.Trash size={13} />
              </button>
            </div>
            <input className="input" placeholder="Portrait URL (optional, https://…)" value={s.photoUrl} onChange={(e) => updateAt(state, setState, "stories", i, { ...s, photoUrl: e.target.value })} />
            <Wysiwyg
              value={s.quote || ""}
              onChange={(html) => updateAt(state, setState, "stories", i, { ...s, quote: html })}
              placeholder="What they'd want a candidate to know about working here…"
              minHeight={80}
            />
          </div>
        ))}
        <button className="btn btn-sm" onClick={() => setState({ ...state, stories: [...state.stories, { name: "", role: "", years: "", quote: "", photoUrl: "" }] })}>
          <Icons.Plus size={12} /> Add story
        </button>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Footer CTA</h2>
        <Row label="Headline"><input className="input" value={state.cta.headline} onChange={(e) => setState({ ...state, cta: { ...state.cta, headline: e.target.value } })}/></Row>
        <Row label="Body">
          <Wysiwyg
            value={state.cta.body || ""}
            onChange={(html) => setState({ ...state, cta: { ...state.cta, body: html } })}
            placeholder="A short note inviting unsolicited applications."
            minHeight={70}
          />
        </Row>
        <Row label="Contact email"><input className="input" value={state.footer.email} onChange={(e) => setState({ ...state, footer: { ...state.footer, email: e.target.value } })}/></Row>
        <Row label="Legal line"><input className="input" value={state.footer.company} onChange={(e) => setState({ ...state, footer: { ...state.footer, company: e.target.value } })}/></Row>
      </Glass>

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {savedAt && <span className="tiny" style={{ color: "var(--accent-solid)" }}>Saved · view site to preview changes</span>}
        <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save & publish"}</button>
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
    if (code === "forbidden") return "Only admins can manage teammates.";
    if (code === "owner_required") return "Only an owner can promote, demote, or remove another owner.";
    if (code === "last_owner") return "Promote another teammate to owner first — every workspace needs at least one.";
    return "Could not update teammate.";
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
    if (!window.confirm(`Remove ${name} from the workspace? Their account stays, but they lose access here.`)) return;
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
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Invite teammates</h2>
        <div className="row" style={{ gap: 8 }}>
          <input className="input" placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select className="select" value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 140 }}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button className="btn btn-primary" disabled={busy || !email.trim()} onClick={sendInvite}>Send invite</button>
        </div>
        {lastInvite && (
          <div className="ai-card" style={{ marginTop: 14 }}>
            <div className="tiny" style={{ color: "var(--ink-1)" }}>Share this link (no SMTP in OSS edition — also printed to server logs):</div>
            <div className="mono" style={{ marginTop: 6, wordBreak: "break-all" }}>{lastInvite}</div>
          </div>
        )}
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, flex: 1 }}>Members ({members.length})</h2>
          {!canManage && (
            <span className="tiny muted">Only admins can manage teammates.</span>
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
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th style={{ width: 220, textAlign: "right" }}>Actions</th></tr></thead>
          <tbody>
            {members.map((m: TeamMember) => {
              const isSelf = m.user.id === me.id;
              // Members can't be edited by other members. Owners can only be
              // modified by other owners.
              const canEdit = canManage && (m.role !== "owner" || me.role === "owner") && !isSelf;
              const canRemove = canEdit;
              return (
                <tr key={m.id}>
                  <td>{m.user.name || "—"}{isSelf ? <span className="tiny muted" style={{ marginLeft: 6 }}>· you</span> : null}</td>
                  <td className="tiny">{m.user.email}</td>
                  <td>
                    {canEdit ? (
                      <select
                        className="select"
                        value={m.role}
                        onChange={(e) => changeRole(m.user.id, e.target.value)}
                        style={{ width: 130, height: 30, fontSize: 12 }}
                      >
                        {me.role === "owner" && <option value="owner">Owner</option>}
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                    ) : (
                      <Chip accent={m.role === "owner" || m.role === "admin"}>{m.role}</Chip>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => setOpenProfileId(m.user.id)}>
                        <Icons.Users size={12} /> View
                      </button>
                      {canRemove && (
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => removeMember(m.user.id, m.user.name || m.user.email)}
                          style={{ color: "oklch(50% 0.18 28)" }}
                          aria-label={`Remove ${m.user.name || m.user.email}`}
                        >
                          <Icons.Trash size={12} /> Remove
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
            <h3 style={{ marginTop: 24, marginBottom: 10 }}>Pending invites ({invites.length})</h3>
            <table className="table">
              <thead><tr><th>Email</th><th>Role</th><th>Expires</th><th>Link</th></tr></thead>
              <tbody>
                {invites.map((i: any) => (
                  <tr key={i.id}>
                    <td>{i.email}</td>
                    <td><Chip>{i.role}</Chip></td>
                    <td className="tiny">{new Date(i.expiresAt).toLocaleDateString()}</td>
                    <td className="tiny mono"><a href={inviteLinkBase + i.token} style={{ color: "var(--accent-solid)" }}>copy</a></td>
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
  const [data, setData] = React.useState<any | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch(`/api/workspace/members/${userId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setData)
      .catch(() => setError("Could not load teammate."));
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
            <div className="topbar-crumb">Team</div>
            <h2 style={{ fontSize: 18 }}>{data?.name || "Teammate"}</h2>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
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
                    <Chip accent={data.role === "owner" || data.role === "admin"}>{data.role}</Chip>
                    <span className="tiny muted">Joined {new Date(data.joinedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <Glass faint style={{ padding: 14, borderRadius: 10 }}>
                <ProfileRow label="Email">{data.email}</ProfileRow>
                <ProfileRow label="Pronouns">{data.pronouns || "—"}</ProfileRow>
                <ProfileRow label="Location">{data.location || "—"}</ProfileRow>
                <ProfileRow label="Time zone">{data.timezone || "—"}</ProfileRow>
                <ProfileRow label="Working hours">{data.workingHours || "—"}</ProfileRow>
              </Glass>
              {data.bio && (
                <Glass faint style={{ padding: 14, borderRadius: 10 }}>
                  <div className="tiny" style={{ marginBottom: 6 }}>Bio</div>
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
        <h2 style={{ fontSize: 18, marginBottom: 14 }}>Provider</h2>
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
                    }}>{p.badge}</span>
                  )}
                </div>
                <div className="tiny" style={{ lineHeight: 1.4 }}>{p.desc}</div>
                {sel && (
                  <div className="row" style={{ marginTop: 10, gap: 4, color: "var(--accent-solid)" }}>
                    <Icons.Check size={12} stroke={2.4}/>
                    <span className="tiny" style={{ color: "var(--accent-solid)", fontWeight: 500 }}>Selected</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <Field label={provider === "ollama" ? "API key (optional)" : `API key · ${providerInfo.name}`}>
            <input
              className="input"
              type="password"
              placeholder={
                provider === "ollama"
                  ? "Leave blank if your Ollama server is unauthenticated"
                  : ai?.hasKey
                  ? "•••••• (set, leave blank to keep)"
                  : "Paste your API key"
              }
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </Field>
          <Field label="Model">
            <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
              {providerInfo.models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        {provider === "ollama" && (
          <div style={{ marginTop: 8 }}>
            <Field label="Server URL">
              <input
                className="input"
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
              />
            </Field>
            <p className="tiny" style={{ marginTop: 4, color: "var(--ink-2)" }}>
              URL of your self-hosted Ollama server. Hosted providers (Anthropic, OpenAI, Google) use their official endpoints and don't need this.
            </p>
          </div>
        )}
        <div className="row" style={{ marginTop: 4, gap: 10 }}>
          <button className="btn btn-sm" onClick={test} disabled={testing === "busy"}>
            {testing === "busy" ? <span className="ai-shimmer" style={{ width: 14, height: 14, borderRadius: 50 }}/> : <Icons.Sparkle size={12} stroke={2}/>}
            {testing === "busy" ? "Testing…" : testing === "ok" ? "Connected" : testing === "err" ? "Failed" : "Test connection"}
          </button>
          {testing === "ok" && (
            <span className="chip" style={{ background: "color-mix(in oklab, oklch(68% 0.16 150) 16%, transparent)", color: "oklch(45% 0.16 150)", borderColor: "transparent" }}>
              <Icons.Check size={11} stroke={2.4}/> Connected
            </span>
          )}
          {testing === "err" && (
            <span className="chip" style={{ background: "color-mix(in oklab, oklch(60% 0.18 28) 16%, transparent)", color: "oklch(50% 0.18 28)", borderColor: "transparent" }}>
              <Icons.X size={11}/> Failed
            </span>
          )}
          <div style={{ flex: 1 }} />
          <span className="tiny">~{(ai?.tokensUsed || 0).toLocaleString()} / {(ai?.tokensQuota || 100000).toLocaleString()} tokens used this month</span>
        </div>
        <div className="funnel-bar" style={{ marginTop: 8 }}>
          <div className="funnel-fill" style={{ width: `${tokensPct}%` }} />
        </div>
      </Glass>

      {/* ── Where AI shows up ────────────────────────────────────── */}
      <Glass className="card" style={{ padding: 22, borderRadius: 14 }}>
        <h2 style={{ fontSize: 18, marginBottom: 14 }}>Where AI shows up</h2>
        {AI_FEATURES.map((f, i) => (
          <ToggleRow
            key={f.id}
            label={f.name}
            desc={f.desc}
            on={features[f.id] ?? i < 3}
            onChange={() => toggleFeature(f.id)}
          />
        ))}
      </Glass>

      {/* ── Recap & digests ──────────────────────────────────────── */}
      <Glass className="card" style={{ padding: 22, borderRadius: 14 }}>
        <h2 style={{ fontSize: 18, marginBottom: 6 }}>Recap & digests</h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
          A daily briefing on the dashboard, plus opt-in weekly and monthly emails to
          workspace admins. The same engine drives all three.
        </p>

        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-1)", marginBottom: 8 }}>
            Cadences
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {[
              { id: "recapDaily",   label: "Today",   desc: "Always on the dashboard" },
              { id: "recapWeekly",  label: "Weekly",  desc: "Email · Monday 08:00 local" },
              { id: "recapMonthly", label: "Monthly", desc: "Email · 1st of month" },
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
          <Field label="Daily delivery">
            <select className="select" value={dailyHour} onChange={(e) => setDailyHour(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => h).map((h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00 local</option>
              ))}
            </select>
          </Field>
          <Field label="Weekly delivery">
            <select className="select" value={weeklyDay} onChange={(e) => setWeeklyDay(Number(e.target.value))}>
              {[
                { v: 1, l: "Monday" }, { v: 2, l: "Tuesday" }, { v: 3, l: "Wednesday" },
                { v: 4, l: "Thursday" }, { v: 5, l: "Friday" }, { v: 6, l: "Saturday" }, { v: 7, l: "Sunday" },
              ].map((d) => (
                <option key={d.v} value={d.v}>{d.l}</option>
              ))}
            </select>
          </Field>
          <Field label="Monthly delivery">
            <select className="select" value={monthlyDay} onChange={(e) => setMonthlyDay(Number(e.target.value))}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>Day {d}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* Tone — selection-card grid (Factual / Conversational / Quirky).
            Mirrors the Accent palette pattern from the design prototype. */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-1)", marginBottom: 8 }}>
            Tone of AI insights
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {([
              { id: "factual", label: "Factual", preview: '"42% of replies cited salary."' },
              { id: "conversational", label: "Conversational", preview: '"A lot of salary questions came up this week."' },
              { id: "quirky", label: "Quirky", preview: '"Money talk dominated the inbox 💸"' },
            ] as const).map((t) => {
              const sel = recapTone === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => setRecapTone(t.id)}
                  style={{
                    padding: 14, borderRadius: 12, cursor: "default",
                    background: sel ? "var(--accent-soft)" : "var(--glass-bg-faint)",
                    border: `0.5px solid ${sel ? "var(--accent-solid)" : "var(--line)"}`,
                  }}
                >
                  <div className="row" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{t.label}</span>
                    {sel && <Icons.Check size={14} stroke={2.4} style={{ color: "var(--accent-solid)" }}/>}
                  </div>
                  <div className="tiny" style={{ fontStyle: "italic" }}>{t.preview}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recipients — explicit subset of admins, or "all" by default. */}
        <div style={{ marginTop: 16 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-1)", flex: 1 }}>
              Recipients
            </span>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setRecipients(recipients === null ? adminMembers.map((m) => m.user.id) : null)}
            >
              {recipients === null ? "Customize" : "All admins"}
            </button>
          </div>
          {recipients === null ? (
            <div className="tiny" style={{ color: "var(--ink-2)" }}>
              Sending to all workspace owners and admins ({adminMembers.length}).
              Per-user mute lives in Settings → Profile → Notifications.
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
                      <div className="tiny">{m.user.email} · {m.role}</div>
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
            label="Suggested actions in recap"
            desc="Adds 'consider doing X' nudges. Some teams prefer just the facts."
            on={features.recapSuggestedActions === true}
            onChange={() => toggleFeature("recapSuggestedActions")}
          />
        </div>

        {/* Advanced thresholds — collapsed disclosure per §11.4. */}
        <div className="row" style={{ paddingTop: 12, borderTop: "0.5px solid var(--line)", marginTop: 4 }}>
          <span className="tiny" style={{ flex: 1, color: "var(--ink-2)" }}>Advanced thresholds</span>
          <button className="btn btn-sm btn-ghost" onClick={() => setThresholdsOpen((v) => !v)}>
            {thresholdsOpen ? "Hide" : "Customize"} <Icons.ChevronDown size={12}/>
          </button>
        </div>
        {thresholdsOpen && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
            <Field label="Stale-stage multiplier">
              <input
                className="input"
                type="number"
                step={0.1}
                min={0.5}
                max={10}
                value={staleMult}
                onChange={(e) => setStaleMult(parseFloat(e.target.value) || 1.5)}
              />
              <div className="tiny" style={{ marginTop: 4, color: "var(--ink-2)" }}>× team's median time-in-stage</div>
            </Field>
            <Field label="Awaiting-reply window">
              <input
                className="input"
                type="number"
                min={1}
                max={720}
                value={awaitingHrs}
                onChange={(e) => setAwaitingHrs(parseInt(e.target.value, 10) || 48)}
              />
              <div className="tiny" style={{ marginTop: 4, color: "var(--ink-2)" }}>hours since application</div>
            </Field>
            <Field label="Retention-horizon warning">
              <input
                className="input"
                type="number"
                min={1}
                max={365}
                value={retentionDays}
                onChange={(e) => setRetentionDays(parseInt(e.target.value, 10) || 30)}
              />
              <div className="tiny" style={{ marginTop: 4, color: "var(--ink-2)" }}>days before 12-month horizon</div>
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
            {testingRecap === "busy" ? "Building…" : "Build now"}
          </button>
          {testingRecap === "ok" && (
            <span className="chip" style={{ background: "color-mix(in oklab, oklch(68% 0.16 150) 16%, transparent)", color: "oklch(45% 0.16 150)", borderColor: "transparent" }}>
              <Icons.Check size={11} stroke={2.4}/> Recap regenerated
            </span>
          )}
          {testingRecap === "err" && (
            <span className="chip" style={{ background: "color-mix(in oklab, oklch(60% 0.18 28) 16%, transparent)", color: "oklch(50% 0.18 28)", borderColor: "transparent" }}>
              <Icons.X size={11}/> Build failed
            </span>
          )}
          <div style={{ flex: 1 }} />
          <span className="tiny">
            {recipients === null ? `${adminMembers.length} admin recipients` : `${recipients.length} selected recipients`}
          </span>
        </div>
      </Glass>

      {/* ── Pulse — engagement signal ────────────────────────────── */}
      <Glass className="card" style={{ padding: 22, borderRadius: 14 }}>
        <h2 style={{ fontSize: 18, marginBottom: 6 }}>Pulse — engagement signal</h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
          Scores how engaged each candidate is, refreshed on every inbound signal.
          AI sentiment is one input — turn it off for a purely behavioral Pulse.
        </p>
        <ToggleRow
          label="Use AI sentiment in Pulse"
          desc="When off, Pulse is computed from behavior only (opens, clicks, reply cadence)."
          on={features.pulseSentiment !== false}
          onChange={() => toggleFeature("pulseSentiment")}
        />
        <ToggleRow
          label="Pulse alerts"
          desc="Notify the candidate's owner the moment Pulse drops a band."
          on={features.pulseAlerts !== false}
          onChange={() => toggleFeature("pulseAlerts")}
        />
        <ToggleRow
          label="Lock score on unsubscribe"
          desc="When a candidate unsubscribes from communications, Pulse locks at 0."
          on={features.pulseLockOnUnsubscribe !== false}
          onChange={() => toggleFeature("pulseLockOnUnsubscribe")}
        />
      </Glass>

      {/* ── Review queue rules ───────────────────────────────────── */}
      <ReviewQueueRulesCard ai={ai} role={currentUser?.role || "member"} />

      {/* ── Data & privacy ───────────────────────────────────────── */}
      <Glass className="card" style={{ padding: 22, borderRadius: 14 }}>
        <h2 style={{ fontSize: 18, marginBottom: 6 }}>Data & privacy</h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
          Resume content is sent to {providerInfo.name} when AI features are used. Configure what's allowed.
        </p>
        <ToggleRow label="Redact PII before sending to AI" desc="Names, emails, phone numbers replaced with placeholders." on={redact} onChange={setRedact}/>
        <ToggleRow label="Don't log prompts" desc="Run requests with provider's no-log header where supported." on={nolog} onChange={setNolog}/>
        <ToggleRow label="Cache AI responses" desc="Skip re-runs for the same input — reduces token usage." on={cache} onChange={setCache}/>
      </Glass>

      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>
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

const RQ_BUCKETS: Array<{
  id: string;
  label: string;
  desc: string;
  icon: keyof typeof Icons;
  defaultSeverity: 1 | 2 | 3 | 4 | 5;
  enabledByDefault: boolean;
  thresholds: Array<{ key: string; label: string; suffix: string; min: number; max: number; step: number; default: number }>;
  phase: 1 | 2;
}> = [
  {
    id: "no-reply",
    label: "Awaiting your reply",
    desc: "Candidate replied to a thread you haven't responded to yet.",
    icon: "Mail",
    defaultSeverity: 5,
    enabledByDefault: true,
    thresholds: [],
    phase: 1,
  },
  {
    id: "post-interview",
    label: "Post-interview decision",
    desc: "In interview stage longer than this many days.",
    icon: "Pipeline",
    defaultSeverity: 5,
    enabledByDefault: true,
    thresholds: [
      { key: "interviewDecisionDays", label: "Flag after", suffix: "days", min: 3, max: 30, step: 1, default: 10 },
    ],
    phase: 1,
  },
  {
    id: "offer-pending",
    label: "Offer pending",
    desc: "Offer extended but the candidate hasn't responded.",
    icon: "Heart",
    defaultSeverity: 5,
    enabledByDefault: true,
    thresholds: [
      { key: "offerNudgeDays", label: "Nudge after", suffix: "days", min: 1, max: 10, step: 1, default: 3 },
    ],
    phase: 1,
  },
  {
    id: "stale-applied",
    label: "Stale applications",
    desc: "Applied but no outreach yet.",
    icon: "Clock",
    defaultSeverity: 4,
    enabledByDefault: true,
    thresholds: [
      { key: "staleAppliedDays", label: "Flag after", suffix: "days", min: 1, max: 14, step: 1, default: 3 },
    ],
    phase: 1,
  },
  {
    id: "schedule-needed",
    label: "Schedule needed",
    desc: "Moved to interview stage but no calendar invite exists.",
    icon: "Calendar",
    defaultSeverity: 4,
    enabledByDefault: true,
    thresholds: [
      { key: "scheduleWindowDays", label: "Within", suffix: "days", min: 2, max: 14, step: 1, default: 5 },
    ],
    phase: 1,
  },
  {
    id: "missing-debrief",
    label: "Missing debrief",
    desc: "Interview happened but no debrief was recorded.",
    icon: "FileText",
    defaultSeverity: 3,
    enabledByDefault: true,
    thresholds: [
      { key: "debriefSlaHours", label: "SLA after interview", suffix: "hours", min: 4, max: 72, step: 1, default: 24 },
    ],
    phase: 1,
  },
  {
    id: "reference-overdue",
    label: "Reference overdue",
    desc: "Reference checks pending for too long. (Awaiting schema — toggle is a no-op for now.)",
    icon: "Check",
    defaultSeverity: 3,
    enabledByDefault: false,
    thresholds: [
      { key: "referenceSlaDays", label: "Flag after", suffix: "days", min: 1, max: 14, step: 1, default: 5 },
    ],
    phase: 2,
  },
  {
    id: "long-cold-scorer",
    label: "Long-cold high scorer",
    desc: "Strong AI fit but stagnant in an early stage.",
    icon: "Star",
    defaultSeverity: 4,
    enabledByDefault: true,
    thresholds: [
      { key: "coldScorerMinScore", label: "Min score", suffix: "/ 100", min: 50, max: 100, step: 1, default: 80 },
      { key: "coldScorerStageMult", label: "Stale multiplier", suffix: "× median", min: 1.0, max: 4.0, step: 0.1, default: 2.0 },
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
      setError(j?.error === "forbidden" ? "Only admins can change these rules." : "Could not save.");
      return;
    }
    setSavedAt(Date.now());
    router.refresh();
  }

  async function rebuildNow() {
    const r = await fetch("/api/review-queue/refresh", { method: "POST" });
    if (r.status === 429) {
      setError("Rebuild rate-limited — wait a moment before trying again.");
    } else if (r.ok) {
      setError(null);
      setSavedAt(Date.now());
    }
  }

  return (
    <Glass className="card" id="review-queue" style={{ padding: 22, borderRadius: 14 }}>
      <div className="row" style={{ alignItems: "baseline", marginBottom: 6 }}>
        <h2 style={{ fontSize: 18, flex: 1 }}>Review queue</h2>
        <span className="tiny muted">Cache refreshes every hour</span>
      </div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
        Configurable rules drive the triage queue surfaced in the topbar.
        Each bucket has a toggle, a severity weight, and (where it makes sense) a threshold knob.
      </p>

      {RQ_BUCKETS.map((b) => {
        const s = state.buckets[b.id] || defaultRuleState(role).buckets[b.id];
        const I = Icons[b.icon];
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
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{b.label}</span>
                {b.phase === 2 && (
                  <span
                    className="chip"
                    style={{ height: 18, fontSize: 10, padding: "0 6px", color: "var(--ink-2)" }}
                  >
                    Awaiting schema
                  </span>
                )}
              </div>
              <div className="tiny" style={{ marginTop: 2 }}>{b.desc}</div>
              {b.thresholds.length > 0 && (
                <div className="row" style={{ gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                  {b.thresholds.map((t) => (
                    <label key={t.key} className="row" style={{ gap: 6, fontSize: 12.5 }}>
                      <span className="tiny" style={{ color: "var(--ink-2)" }}>{t.label}</span>
                      <input
                        className="input"
                        type="number"
                        min={t.min}
                        max={t.max}
                        step={t.step}
                        value={s.thresholds[t.key] ?? t.default}
                        onChange={(e) => updateThreshold(b.id, t.key, Number(e.target.value))}
                        style={{ width: 88, height: 28, padding: "0 8px", fontSize: 12.5 }}
                      />
                      <span className="tiny" style={{ color: "var(--ink-2)" }}>{t.suffix}</span>
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
                aria-label={s.enabled ? `Disable ${b.label}` : `Enable ${b.label}`}
              />
            </div>
          </div>
        );
      })}

      <div className="row" style={{ marginTop: 14, gap: 14, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>AI overlay</div>
          <div className="tiny">Adds 1–4 cross-cutting AI insights below the rule-based items. Requires a configured AI provider.</div>
        </div>
        <select
          className="select"
          value={state.aiOverlay.maxItems}
          onChange={(e) => setState((s) => ({ ...s, aiOverlay: { ...s.aiOverlay, maxItems: Number(e.target.value) as 1 | 2 | 3 | 4 } }))}
          disabled={!state.aiOverlay.enabled}
          style={{ width: 110, height: 30, fontSize: 12.5 }}
        >
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>Max {n}</option>)}
        </select>
        <button
          className={`switch ${state.aiOverlay.enabled ? "on" : ""}`}
          onClick={() => setState((s) => ({ ...s, aiOverlay: { ...s.aiOverlay, enabled: !s.aiOverlay.enabled } }))}
        />
      </div>

      <div className="row" style={{ marginTop: 14, gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="tiny" style={{ marginBottom: 4, color: "var(--ink-2)" }}>Default scope</div>
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
                {opt === "mine" ? "Mine only" : "Workspace-wide"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 16, gap: 10 }}>
        {error && <span className="tiny" style={{ color: "oklch(50% 0.18 28)" }}>{error}</span>}
        {savedAt && !error && (
          <span className="tiny" style={{ color: "var(--accent-solid)" }}>Saved · workspace cache cleared</span>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={rebuildNow}>
          <Icons.Refresh size={11} /> Rebuild now
        </button>
        <button className="btn btn-sm btn-primary" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save rules"}
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
  return (
    <div className="row" style={{ gap: 2 }} role="radiogroup" aria-label="Severity">
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
      setStatus(json?.error || "Could not save email config.");
      return;
    }
    setStatus("Saved. Run a test to verify the connection.");
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
      setStatus(json?.error || "Test failed.");
      return;
    }
    if (json.imap && json.smtp) setStatus("✓ IMAP and SMTP connected successfully.");
    else setStatus(`Partial: IMAP ${json.imap ? "✓" : "✗"} · SMTP ${json.smtp ? "✓" : "✗"}${json.error ? ` — ${json.error}` : ""}`);
  }

  async function pollNow() {
    setPolling(true);
    setStatus(null);
    const res = await fetch("/api/email-account/poll", { method: "POST" });
    setPolling(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(json?.error || "Poll failed.");
      return;
    }
    const sinceLabel = json.since ? ` since ${new Date(json.since).toLocaleString()}` : "";
    setStatus(
      `Polled${sinceLabel} — checked ${json.checked || 0} message${json.checked === 1 ? "" : "s"}, ingested ${json.ingested || 0} new.`,
    );
    router.refresh();
  }

  async function disconnect() {
    if (!confirm("Disconnect this email account? Existing messages are kept; polling stops.")) return;
    const res = await fetch("/api/email-account", { method: "DELETE" });
    if (res.ok) {
      setStatus("Disconnected.");
      router.refresh();
    }
  }

  return (
    <>
      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 6 }}>Email integration</h2>
        <p className="muted" style={{ marginBottom: 14 }}>
          Connect a shared inbox (Gmail, Outlook, FastMail, your provider) so candidate replies show up here
          and you can answer without leaving the app. Use an <b>app password</b> if your provider requires one.
        </p>

        {email?.lastPolledAt && (
          <Chip dot="oklch(68% 0.16 150)" style={{ marginBottom: 14 }}>
            Last polled {new Date(email.lastPolledAt).toLocaleString()}
          </Chip>
        )}
        {email?.lastError && (
          <div className="chip chip-danger" style={{ marginBottom: 14 }}>
            Last error: {email.lastError.slice(0, 200)}
          </div>
        )}

        <div className="section-h" style={{ marginTop: 4, marginBottom: 8 }}>From identity</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="From name"><input className="input" value={form.fromName} onChange={(e) => update("fromName", e.target.value)} placeholder={currentUser?.name || "Your name"} /></Field>
          <Field label="From address"><input className="input" value={form.fromAddress} onChange={(e) => update("fromAddress", e.target.value)} placeholder={`careers@${workspace.domain}`} /></Field>
        </div>

        <div className="section-h" style={{ marginTop: 18, marginBottom: 8 }}>Mailbox login</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Username">
            <input
              className="input"
              value={form.username}
              onChange={(e) => update("username", e.target.value)}
              placeholder="careers@yourdomain.com"
            />
          </Field>
          <Field label="Password">
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder={email?.imapHost ? "•••••• (leave blank to keep)" : "App password"}
            />
          </Field>
        </div>
        <p className="tiny" style={{ marginTop: -2, marginBottom: 6, color: "var(--ink-2)" }}>
          One login is used for both inbound (IMAP) and outbound (SMTP). Most providers require an <b>app password</b> rather than your account password — check your provider's docs.
        </p>

        <div className="section-h" style={{ marginTop: 18, marginBottom: 8 }}>IMAP server (inbound)</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <Field label="Host"><input className="input" value={form.imapHost} onChange={(e) => update("imapHost", e.target.value)} placeholder="imap.gmail.com" /></Field>
          <Field label="Port"><input className="input" type="number" value={form.imapPort} onChange={(e) => update("imapPort", e.target.value)} /></Field>
        </div>
        <ToggleRow label="Use TLS" desc="Required by almost every provider." on={form.imapTls} onChange={(v) => update("imapTls", v)} />

        <div className="section-h" style={{ marginTop: 18, marginBottom: 8 }}>SMTP server (outbound)</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <Field label="Host"><input className="input" value={form.smtpHost} onChange={(e) => update("smtpHost", e.target.value)} placeholder="smtp.gmail.com" /></Field>
          <Field label="Port"><input className="input" type="number" value={form.smtpPort} onChange={(e) => update("smtpPort", e.target.value)} /></Field>
        </div>
        <ToggleRow label="STARTTLS" desc="Off for port 465 (implicit TLS), on for 587 (STARTTLS)." on={form.smtpTls} onChange={(v) => update("smtpTls", v)} />

        <ToggleRow label="Polling enabled" desc="When off, the background worker stops fetching new mail (existing messages are preserved)." on={form.enabled} onChange={(v) => update("enabled", v)} />

        {status && (
          <div className="ai-card" style={{ marginTop: 14, fontSize: 13 }}>
            {status}
          </div>
        )}

        <div className="row" style={{ marginTop: 18, gap: 8, flexWrap: "wrap" }}>
          {email && <button className="btn btn-sm btn-ghost" onClick={disconnect}>Disconnect</button>}
          <span style={{ flex: 1 }} />
          <button className="btn" disabled={testing || !email} onClick={test}>{testing ? "Testing…" : "Test connection"}</button>
          <button className="btn" disabled={polling || !email} onClick={pollNow}>{polling ? "Polling…" : "Poll now"}</button>
          <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : email ? "Update" : "Connect"}</button>
        </div>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>How matching works</h2>
        <ul style={{ margin: "0 0 0 18px", padding: 0, fontSize: 13.5, color: "var(--ink-1)", lineHeight: 1.65 }}>
          <li>Inbound mail is matched to candidates by sender address (case-insensitive).</li>
          <li>If the sender is unknown, the subject line is scanned for a job title — e.g. "Re: Senior Product Designer — follow-up". The applicant whose name best matches the sender's name is picked.</li>
          <li>Senders that match neither a known address nor a job/applicant in the workspace are silently ignored.</li>
          <li>When possible, replies thread under the existing candidate↔job conversation; otherwise a new thread is opened.</li>
          <li>Outbound replies sent from Vellum use the From identity above and thread via In-Reply-To headers.</li>
          <li>Polling cadence: {Math.round(Number(process.env.NEXT_PUBLIC_EMAIL_POLL_INTERVAL_S || 180))}s. Run "Poll now" to fetch immediately.</li>
        </ul>
      </Glass>
    </>
  );
}

// ───────────────────────────────────────── Calendar ─────────────────────
function CalendarTab({ workspace, email }: any) {
  const router = useRouter();
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
      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>Calendar invites</h2>
        <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
          When you schedule an interview, Vellum sends the candidate an email with a real{" "}
          <span className="mono">.ics</span> calendar attachment. They can open it in Gmail, Apple Calendar,
          Outlook or any other client and the event lands on their calendar with the right time, location,
          meeting link and attendees.
        </p>

        <ToggleRow
          label="Send invites by default"
          desc="The 'Send now' toggle in the Schedule modal defaults to this value. Recruiters can override per-meeting."
          on={sendInvites}
          onChange={setSendInvites}
        />

        <div className="ai-card" style={{ marginTop: 14 }}>
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <Icons.Calendar size={13} style={{ color: "var(--accent-solid)" }} />
            <strong style={{ fontSize: 13 }}>How invites are delivered</strong>
          </div>
          <ul style={{ margin: "0 0 0 18px", padding: 0, fontSize: 13, color: "var(--ink-1)", lineHeight: 1.7 }}>
            <li>
              Outgoing mail uses your workspace's SMTP credentials from{" "}
              <Link href="/settings?tab=email" style={{ color: "var(--accent-solid)" }}>Settings → Email</Link>.
              {emailReady ? (
                <Chip dot="oklch(68% 0.16 150)" style={{ marginLeft: 8 }}>Ready · {email.fromAddress}</Chip>
              ) : (
                <Chip warn dot style={{ marginLeft: 8 }}>Not configured</Chip>
              )}
            </li>
            <li>The .ics file follows RFC 5545 with method <span className="mono">REQUEST</span>, an event UID, and a 10-minute reminder.</li>
            <li>Picked interviewers are CC'd; their emails appear as ATTENDEES so clients show the full roster.</li>
            <li>Meeting URL becomes the event's <span className="mono">URL</span> field — most clients render it as a Join button.</li>
            <li>Re-sending an interview update bumps the iCalendar <span className="mono">SEQUENCE</span> so clients refresh in place instead of duplicating.</li>
          </ul>
        </div>
      </Glass>

      <CalendarAccountsPanel />

      <CalendarDefaultsPanel workspace={workspace} />


      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {savedAt && (
          <span className="tiny" style={{ color: "var(--accent-solid)" }}>
            Saved · applies to new interviews scheduled from now on
          </span>
        )}
        <button className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
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
    if (!confirm("Disconnect this calendar? Vellum will stop syncing meetings to it.")) return;
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
      <h2 style={{ fontSize: 18, marginBottom: 4 }}>Calendar accounts</h2>
      <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
        Connect a calendar so Vellum can push interviews straight to it and skip slot conflicts when you schedule.
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
            ? `Connected ${params.get("calendar_connected")} calendar.`
            : `Connect failed: ${params.get("calendar_error")}`}
        </div>
      )}

      {loaded && accounts.length === 0 && (
        <p className="tiny" style={{ marginBottom: 12 }}>No calendars connected yet.</p>
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
                    <span style={{ color: "oklch(58% 0.20 28)" }}>error · {a.lastError || "unknown"}</span>
                  ) : a.lastPolledAt ? (
                    `last sync ${new Date(a.lastPolledAt).toLocaleString()}`
                  ) : (
                    "not synced yet"
                  )}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => syncNow(a.id)} disabled={st?.busy}>
                <Icons.Refresh size={11} /> {st?.busy ? "Syncing…" : "Sync now"}
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => disconnect(a.id)}>
                Disconnect
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
                  <>Sync failed: {st.error}</>
                ) : st.count ? (
                  <>Pulled {st.count} event{st.count === 1 ? "" : "s"} into the calendar view.</>
                ) : (
                  <>
                    Sync completed — 0 events found in the next 90 days. The
                    connection works; this calendar simply has nothing upcoming
                    in the window we pull. Try a different default calendar
                    above, or add an event to confirm.
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {providers?.google.configured ? (
          <a className="btn" href="/api/calendar/oauth/google/start">
            <Icons.Globe size={12} /> Connect Google Calendar
          </a>
        ) : (
          <button className="btn" disabled title="Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET on the server">
            <Icons.Globe size={12} /> Connect Google · not configured
          </button>
        )}
        {providers?.microsoft.configured ? (
          <a className="btn" href="/api/calendar/oauth/microsoft/start">
            <Icons.Mail size={12} /> Connect Microsoft 365
          </a>
        ) : (
          <button className="btn" disabled title="Set MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET on the server">
            <Icons.Mail size={12} /> Connect Microsoft · not configured
          </button>
        )}
        <button className="btn" onClick={() => setCaldavOpen((o) => !o)}>
          <Icons.AtSign size={12} /> Connect iCloud / CalDAV
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
    { label: "Custom", url: "" },
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
        setError(j.error || "Could not connect");
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
        setError(j.error || "Save failed");
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Glass faint style={{ padding: 14, borderRadius: 10, marginTop: 12 }}>
      <div className="section-h" style={{ marginBottom: 6 }}>CalDAV connection</div>
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
        <input className="input" placeholder="Server URL (https://…)" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} required style={{ marginBottom: 6 }} />
        <input className="input" placeholder="Email / username" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ marginBottom: 6 }} />
        <input className="input" type="password" placeholder="Password (use an app-specific password)" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ marginBottom: 6 }} />
        {error && (
          <div style={{ color: "oklch(58% 0.20 28)", fontSize: 12, marginBottom: 6 }}>{error}</div>
        )}
        {!calendars ? (
          <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
            {busy ? "Connecting…" : "Test connection"}
          </button>
        ) : (
          <>
            <p className="tiny" style={{ marginBottom: 6 }}>Pick the calendar Vellum should write to:</p>
            <select className="select" value={pickedUrl} onChange={(e) => setPickedUrl(e.target.value)} style={{ marginBottom: 6 }}>
              {calendars.map((c) => (
                <option key={c.url} value={c.url}>
                  {c.displayName}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save calendar"}
            </button>
          </>
        )}
      </form>
    </Glass>
  );
}

function CalendarDefaultsPanel({ workspace }: { workspace: any }) {
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
      <h2 style={{ fontSize: 18, marginBottom: 4 }}>Calendar defaults</h2>
      <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
        Working hours used to render the grid. Times outside this window are dimmed but still scrollable.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
        <label style={{ display: "block" }}>
          <div className="tiny" style={{ marginBottom: 4 }}>Day starts</div>
          <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label style={{ display: "block" }}>
          <div className="tiny" style={{ marginBottom: 4 }}>Day ends</div>
          <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label style={{ display: "block" }}>
          <div className="tiny" style={{ marginBottom: 4 }}>Default kind</div>
          <select className="select" value={defaultKind} onChange={(e) => setDefaultKind(e.target.value as any)}>
            <option value="phone">Phone screen</option>
            <option value="video">Video call</option>
            <option value="onsite">On-site</option>
            <option value="panel">Panel</option>
          </select>
        </label>
        <label style={{ display: "block" }}>
          <div className="tiny" style={{ marginBottom: 4 }}>Timezone</div>
          <input className="input" value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Europe/Berlin" />
        </label>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {savedAt && <span className="tiny" style={{ color: "var(--accent-solid)" }}>Saved</span>}
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save defaults"}
        </button>
      </div>
    </Glass>
  );
}

// ───────────────────────────────────────── Appearance ─────────────────────
function AppearanceTab({ currentUser }: any) {
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

  return (
    <>
      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Mode</h2>
        <div className="row" style={{ gap: 12 }}>
          {(["light", "dark"] as const).map((m) => (
            <button key={m} className={`btn ${prefs.theme === m ? "btn-primary" : ""}`} onClick={() => update("theme", m)} style={{ flex: 1, height: 60 }}>
              {m === "dark" ? <Icons.Moon size={14}/> : <Icons.Sun size={14}/>}
              <span style={{ textTransform: "capitalize" }}>{m}</span>
            </button>
          ))}
        </div>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Accent</h2>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          {Object.entries(ACCENTS).map(([k, v]) => (
            <button key={k} className={`btn ${prefs.accent === k ? "btn-primary" : ""}`} onClick={() => update("accent", k as any)} style={{ height: 44, padding: "0 14px" }}>
              <span style={{ width: 14, height: 14, borderRadius: 4, background: `linear-gradient(135deg, ${v.a1}, ${v.a2})` }} />
              {v.label}
            </button>
          ))}
        </div>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Density</h2>
        <div className="row" style={{ gap: 12 }}>
          {(["compact", "cozy"] as const).map((d) => (
            <button key={d} className={`btn ${prefs.density === d ? "btn-primary" : ""}`} onClick={() => update("density", d)} style={{ flex: 1 }}>
              {d}
            </button>
          ))}
        </div>
      </Glass>

      <Glass className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Glass intensity <span className="tiny muted">{prefs.glassIntensity.toFixed(2)}×</span></h2>
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
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>Cookies &amp; consent</h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
          Show a discreet consent banner on your public career site and load third-party scripts only after
          candidates opt in. Necessary cookies are always allowed; functional and marketing scripts wait for
          consent.
        </p>

        <ToggleRow
          label="Show consent banner on public pages"
          desc="When off, the banner is hidden and only Necessary scripts will load."
          on={config.enabled}
          onChange={(v) => save({ ...config, enabled: v })}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
          <Field label="Banner title">
            <input
              className="input"
              value={config.banner?.title || ""}
              placeholder="We respect your cookie choices"
              onChange={(e) => setConfig({ ...config, banner: { ...config.banner, title: e.target.value } })}
              onBlur={() => save(config)}
            />
          </Field>
          <Field label="Banner message">
            <input
              className="input"
              value={config.banner?.message || ""}
              placeholder="We use a few cookies to keep this site running…"
              onChange={(e) => setConfig({ ...config, banner: { ...config.banner, message: e.target.value } })}
              onBlur={() => save(config)}
            />
          </Field>
        </div>
      </Glass>

      {CATEGORY_ORDER.map((cat) => {
        const meta = CATEGORY_LABELS[cat];
        const inCat = config.scripts.filter((s) => s.category === cat);
        return (
          <Glass key={cat} className="card" style={{ padding: 24 }}>
            <div className="row" style={{ alignItems: "baseline", marginBottom: 4 }}>
              <h2 style={{ flex: 1, fontSize: 18 }}>{meta.title}</h2>
              <Chip>
                {inCat.length} script{inCat.length === 1 ? "" : "s"}
              </Chip>
            </div>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>{meta.blurb}</p>

            {inCat.length === 0 ? (
              <div className="tiny" style={{ padding: "16px 0", color: "var(--ink-2)" }}>
                No scripts in this category yet.
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
                        {s.src || (s.code ? `inline (${s.code.length} chars)` : "—")}
                      </div>
                    </div>
                    <button className={`switch ${s.enabled ? "on" : ""}`} onClick={() => toggleScript(s.id, !s.enabled)} />
                    <button className="btn btn-sm" onClick={() => setEditing(s)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(s.id)}>Delete</button>
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
                <Icons.Plus size={12} stroke={2} /> Add script
              </button>
            </div>
          </Glass>
        );
      })}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {savedAt && <span className="tiny" style={{ color: "var(--ink-2)" }}>Saved · {new Date(savedAt).toLocaleTimeString()}</span>}
        {saving && <span className="tiny">Saving…</span>}
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
          <h2 style={{ flex: 1, fontSize: 17 }}>{script.name ? "Edit script" : "Add script"}</h2>
          <button className="btn btn-sm btn-ghost btn-icon" onClick={onCancel} aria-label="Close">
            <Icons.X size={14} stroke={2} />
          </button>
        </div>

        <Field label="Category">
          <select
            className="select"
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value as CookieCategory })}
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c].title}
              </option>
            ))}
          </select>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Name">
            <input
              className="input"
              value={draft.name}
              placeholder="Google Analytics"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label="Provider (optional)">
            <input
              className="input"
              value={draft.provider || ""}
              placeholder="Google"
              onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Description (optional)">
          <input
            className="input"
            value={draft.description || ""}
            placeholder="Tracks page views and conversion."
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </Field>

        <Field label="External script URL">
          <input
            className="input mono"
            value={draft.src || ""}
            placeholder="https://www.googletagmanager.com/gtag/js?id=G-XXXX"
            onChange={(e) => setDraft({ ...draft, src: e.target.value })}
          />
        </Field>

        <Field label="…or inline JS">
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
          The script will only load when a visitor consents to the <b>{CATEGORY_LABELS[draft.category].title.toLowerCase()}</b>{" "}
          category. Use either a URL or an inline snippet — if both are set, the URL wins.
        </div>

        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
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
            {script.name ? "Save changes" : "Add script"}
          </button>
        </div>
      </Glass>
    </div>
  );
}

// ───────────────────────────────────────── Danger ─────────────────────
function DangerTab({ workspace }: any) {
  const router = useRouter();
  const [confirm, setConfirm] = React.useState("");
  const [purging, setPurging] = React.useState<"idle" | "busy" | "ok" | "err">("idle");

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
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Danger zone</h2>

      <div className="row" style={{ padding: "12px 0", borderBottom: "0.5px solid var(--line)" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500 }}>Export all workspace data</div>
          <div className="tiny">JSON file with jobs, candidates, threads, notes, and interviews.</div>
        </div>
        <button className="btn" onClick={exportData}>Export</button>
      </div>

      {/* Recap cache — non-destructive but worth surfacing here for the
          "I changed thresholds and want a fresh build" workflow per
          RECAP_FEATURE.md §11.7. */}
      <div className="row" style={{ padding: "12px 0", borderBottom: "0.5px solid var(--line)" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500 }}>Purge recap cache</div>
          <div className="tiny">
            Drops all cached today / weekly / monthly recap rows. The next
            dashboard load (or the next worker tick) will rebuild from
            scratch — useful after editing prompts or thresholds.
          </div>
        </div>
        <button className="btn" onClick={purgeRecapCache} disabled={purging === "busy"}>
          {purging === "busy" ? "Purging…" : purging === "ok" ? "✓ Purged" : purging === "err" ? "✗ Failed" : "Purge cache"}
        </button>
      </div>

      <div className="row" style={{ padding: "12px 0", borderBottom: "0.5px solid var(--line)", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, color: "oklch(58% 0.2 28)" }}>Delete workspace</div>
          <div className="tiny">Permanently remove this workspace and all its data. Type the workspace slug to confirm.</div>
          <input className="input" placeholder={workspace.slug} value={confirm} onChange={(e) => setConfirm(e.target.value)} style={{ marginTop: 10, maxWidth: 320 }} />
        </div>
        <button className="btn btn-danger" disabled={confirm !== workspace.slug} onClick={deleteWorkspace}>Delete forever</button>
      </div>
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
