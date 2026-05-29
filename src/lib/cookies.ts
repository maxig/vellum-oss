// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// Cookie-consent types and helpers shared by the admin (settings),
// the public banner (career sites + landing page), and the script
// injection layer. Persisted as workspace.cookieConfig JSON to avoid
// migrations every time a recruiter wants to add a new tracker.

export type CookieCategory = "necessary" | "functional" | "marketing";

export const CATEGORY_ORDER: CookieCategory[] = ["necessary", "functional", "marketing"];

export const CATEGORY_LABELS: Record<CookieCategory, { title: string; blurb: string }> = {
  necessary: {
    title: "Strictly necessary",
    blurb:
      "Required for the site to work — authentication, security, and remembering your consent choice. Always on.",
  },
  functional: {
    title: "Functional",
    blurb:
      "Improve your experience by remembering preferences (language, theme) and powering chat or video widgets.",
  },
  marketing: {
    title: "Marketing & analytics",
    blurb:
      "Measure how candidates use the site and help us tailor follow-up content. Disabled until you opt in.",
  },
};

export type CookieScript = {
  id: string;
  category: CookieCategory;
  name: string;
  provider?: string;
  description?: string;
  src?: string;   // external script URL (loaded async)
  code?: string;  // inline JS, sandboxed via <script> tag injection
  enabled: boolean;
};

export type CookieConfig = {
  enabled: boolean;
  banner?: {
    title?: string;
    message?: string;
  };
  scripts: CookieScript[];
};

export function defaultCookieConfig(): CookieConfig {
  return {
    enabled: true,
    banner: {
      title: "We respect your cookie choices",
      message:
        "We use a few cookies to keep this site running, remember your preferences, and understand how it's used. You decide which.",
    },
    scripts: [],
  };
}

export function normalizeCookieConfig(raw: unknown): CookieConfig {
  const base = defaultCookieConfig();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<CookieConfig>;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : base.enabled,
    banner: {
      title: r.banner?.title?.toString() || base.banner!.title,
      message: r.banner?.message?.toString() || base.banner!.message,
    },
    scripts: Array.isArray(r.scripts)
      ? r.scripts
          .filter((s): s is CookieScript => !!s && typeof s === "object" && !!(s as any).id && !!(s as any).name)
          .map((s) => ({
            id: String(s.id),
            category: (CATEGORY_ORDER.includes((s as any).category) ? s.category : "functional") as CookieCategory,
            name: String(s.name),
            provider: s.provider ? String(s.provider) : undefined,
            description: s.description ? String(s.description) : undefined,
            src: s.src ? String(s.src) : undefined,
            code: s.code ? String(s.code) : undefined,
            enabled: s.enabled !== false,
          }))
      : [],
  };
}

// ── Consent record stored in the browser ────────────────────────────
export type ConsentRecord = {
  necessary: true; // always granted
  functional: boolean;
  marketing: boolean;
  /** ISO string */
  decidedAt: string;
  /** Bumped whenever the policy materially changes — invalidates older records. */
  v: number;
};

export const CONSENT_COOKIE = "vellum_cookie_consent";
export const CONSENT_VERSION = 1;
export const CONSENT_CHANGED_EVENT = "vellum:cookie-consent-changed";

export function emptyConsent(): ConsentRecord {
  return {
    necessary: true,
    functional: false,
    marketing: false,
    decidedAt: new Date(0).toISOString(),
    v: CONSENT_VERSION,
  };
}

export function readConsentFromCookieString(raw: string | null | undefined): ConsentRecord | null {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded) as Partial<ConsentRecord>;
    if (typeof parsed !== "object" || !parsed) return null;
    if (parsed.v !== CONSENT_VERSION) return null;
    return {
      necessary: true,
      functional: !!parsed.functional,
      marketing: !!parsed.marketing,
      decidedAt: typeof parsed.decidedAt === "string" ? parsed.decidedAt : new Date().toISOString(),
      v: CONSENT_VERSION,
    };
  } catch {
    return null;
  }
}

export function categoryAllowed(consent: ConsentRecord | null, category: CookieCategory) {
  if (category === "necessary") return true;
  if (!consent) return false;
  return !!consent[category];
}

// ── First-party cookie registry ─────────────────────────────────────
// Single source of truth for every cookie Vellum itself sets.
// COOKIE_SPEC.md, the public /cookies policy page, and any runtime
// gates (e.g. career-events analytics) all derive from this list.
// When you add a cookie *anywhere* in the codebase, add it here too —
// otherwise the consent banner is lying.

export type FirstPartyCookie = {
  name: string;
  category: CookieCategory;
  purpose: string;
  /** Human-readable lifetime. */
  lifetime: string;
  /** Where in the codebase it is set, for grepability. */
  source: string;
};

export const FIRST_PARTY_COOKIES: FirstPartyCookie[] = [
  // ── Necessary ────────────────────────────────────────────────────
  {
    name: "next-auth.session-token",
    category: "necessary",
    purpose: "Signed-in user session (NextAuth JWT). Without it you can't access the admin app.",
    lifetime: "30 days, rolling",
    source: "src/lib/auth.ts (NextAuth defaults)",
  },
  {
    name: "next-auth.csrf-token",
    category: "necessary",
    purpose: "Anti-CSRF token used by NextAuth on sign-in / sign-out POSTs.",
    lifetime: "Session",
    source: "src/lib/auth.ts (NextAuth defaults)",
  },
  {
    name: "vellum_ws",
    category: "necessary",
    purpose: "Currently selected workspace. Picked the moment you log in or switch workspaces.",
    lifetime: "90 days",
    source: "src/lib/workspace.ts, src/app/api/workspaces/switch/route.ts",
  },
  {
    name: "vellum_oauth_google",
    category: "necessary",
    purpose: "Short-lived state token used during the Google Calendar OAuth handshake.",
    lifetime: "10 minutes",
    source: "src/app/api/calendar/oauth/google/start/route.ts",
  },
  {
    name: "vellum_oauth_microsoft",
    category: "necessary",
    purpose: "Short-lived state token used during the Microsoft 365 OAuth handshake.",
    lifetime: "10 minutes",
    source: "src/app/api/calendar/oauth/microsoft/start/route.ts",
  },
  {
    name: CONSENT_COOKIE,
    category: "necessary",
    purpose: "Stores your cookie consent choices so we don't ask again on every page.",
    lifetime: "12 months",
    source: "src/components/CookieConsent.tsx",
  },
  // ── Functional ───────────────────────────────────────────────────
  // (None today — theme/density are persisted in the User row when
  // signed in, and re-applied via ThemeBoot. Reserved here so future
  // functional cookies are slotted into the right category.)
  // ── Marketing / analytics ───────────────────────────────────────
  {
    name: "vellum_anon",
    category: "marketing",
    purpose:
      "Anonymous session ID used to deduplicate career-site page views and measure apply-form drop-off. Set only after marketing consent.",
    lifetime: "90 days",
    source: "src/lib/career-events.ts",
  },
];

export function cookiesByCategory(category: CookieCategory) {
  return FIRST_PARTY_COOKIES.filter((c) => c.category === category);
}

