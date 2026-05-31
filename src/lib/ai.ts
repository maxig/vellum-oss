// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

type Provider = "anthropic" | "openai" | "google" | "ollama";

export type AIResult = { text: string; mocked: boolean; provider: Provider | "mock" };

const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o-mini",
  google: "gemini-2.0-flash",
  ollama: "llama3.1",
};

// Ollama Cloud's hosted endpoint is fixed. When an Ollama API key is present
// but no base URL is configured, the key is a Cloud key and this is where it
// goes — so an API key alone is enough to turn on the integration. Exported so
// the Settings page resolves the same default instead of keeping its own copy.
export const OLLAMA_CLOUD_URL = "https://ollama.com";
// `llama3.1` (DEFAULT_MODELS.ollama) is a self-hosted-only tag — it 404s on
// Cloud. Fall back to a Cloud-served model when we're talking to Cloud and the
// caller hasn't pinned one. Mirrors the default setup.sh writes.
export const OLLAMA_CLOUD_DEFAULT_MODEL = "gemma4:31b-cloud";

export async function getAIConfig(workspaceId: string) {
  return db.aIConfig.findUnique({ where: { workspaceId } });
}

type AIConfigRow = Awaited<ReturnType<typeof getAIConfig>>;

/** Fully-resolved AI settings: provider plus the key/model/baseUrl actually
 *  used for the call, after merging workspace config with the instance-wide
 *  env defaults. */
type ResolvedAI = { provider: Provider; key: string; model: string; baseUrl: string };

/**
 * Is there a live AI provider for this workspace? True when the resolved
 * provider has an API key (workspace or env), or when Ollama has a base URL.
 * Use this before kicking off background AI work so we don't persist mocks.
 */
export async function isAIEnabled(workspaceId: string, feature?: string): Promise<boolean> {
  const cfg = await getAIConfig(workspaceId);
  const { provider, key, baseUrl } = resolveAI(cfg);

  if (feature) {
    const features = (cfg?.features as Record<string, boolean> | null) || {};
    if (features[feature] === false) return false;
  }

  // Ollama is live when it has an endpoint (baseUrl already folds in the
  // Cloud default for a bare key); every other provider needs a key.
  if (provider === "ollama") return Boolean(baseUrl);
  return Boolean(key);
}

function isProvider(value: unknown): value is Provider {
  return value === "anthropic" || value === "openai" || value === "google" || value === "ollama";
}

/** The instance-wide provider, from env only. This is the fallback used when a
 *  workspace hasn't *usably* configured its own provider. */
function envProvider(): Provider {
  if (isProvider(process.env.AI_PROVIDER)) return process.env.AI_PROVIDER;
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  // Either a self-hosted base URL or a Cloud API key implies Ollama.
  if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_API_KEY) return "ollama";
  return "anthropic";
}

/** Can this provider actually be called given the workspace row + env — i.e. is
 *  it backed by a key (workspace or env), or, for Ollama, a base URL? */
function providerHasCredentials(provider: Provider, cfg: AIConfigRow): boolean {
  if (cfg?.apiKeyEncrypted) return true;
  if (provider === "ollama") {
    return Boolean(cfg?.baseUrl || process.env.OLLAMA_BASE_URL || process.env.OLLAMA_API_KEY);
  }
  return Boolean(getEnvKey(provider));
}

/**
 * Pick the provider to use. A workspace's own provider wins ONLY when it's
 * usable — `AIConfig.provider` has a DB default of "anthropic", so a row created
 * as a side effect of saving unrelated settings looks "configured" while having
 * no key. In that case the stale default must not shadow the instance-wide env
 * provider, so we fall back to it.
 */
function resolveProvider(cfg: AIConfigRow): Provider {
  if (cfg && isProvider(cfg.provider) && providerHasCredentials(cfg.provider, cfg)) {
    return cfg.provider;
  }
  return envProvider();
}

/**
 * Resolve the provider AND the key/model/baseUrl to call it with. Workspace
 * fields only apply when the workspace's own provider is the one we resolved
 * to — after a fallback to the env provider, those fields belong to a different
 * provider and would be wrong (e.g. an Anthropic model name sent to Ollama).
 */
function resolveAI(cfg: AIConfigRow): ResolvedAI {
  const provider = resolveProvider(cfg);
  const useCfg = isProvider(cfg?.provider) && cfg?.provider === provider;

  const key =
    (useCfg && cfg?.apiKeyEncrypted ? decryptSecret(cfg.apiKeyEncrypted) : "") || getEnvKey(provider);

  if (provider === "ollama") {
    // Explicit base URL wins; otherwise an API key means Cloud (always
    // https://ollama.com). Only a keyless install with no URL stays empty.
    const explicitUrl = (useCfg ? cfg?.baseUrl : "") || process.env.OLLAMA_BASE_URL || "";
    const baseUrl = trimTrailingSlash(explicitUrl || (key ? OLLAMA_CLOUD_URL : ""));
    // `llama3.1` (the self-hosted default) 404s on Cloud — pick a Cloud model.
    const explicitModel = (useCfg ? cfg?.model : "") || process.env.OLLAMA_MODEL || "";
    const model =
      explicitModel || (baseUrl === OLLAMA_CLOUD_URL ? OLLAMA_CLOUD_DEFAULT_MODEL : DEFAULT_MODELS.ollama);
    return { provider, key, model, baseUrl };
  }

  const model = (useCfg ? cfg?.model : "") || getEnvModel(provider);
  return { provider, key, model, baseUrl: "" };
}

/**
 * Effective AI settings for display (Settings → AI). Runs the same resolution
 * as the live call path, minus the secret, so the UI shows what will actually
 * run — not the raw workspace row, which may hold a stale default provider that
 * the instance-wide env overrides at runtime.
 */
export function effectiveAISettings(cfg: AIConfigRow): {
  provider: Provider;
  model: string;
  baseUrl: string | null;
  hasKey: boolean;
} {
  const { provider, key, model, baseUrl } = resolveAI(cfg);
  return { provider, model, baseUrl: baseUrl || null, hasKey: Boolean(key) };
}

function getEnvKey(provider: Provider) {
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY || "";
  if (provider === "openai") return process.env.OPENAI_API_KEY || "";
  if (provider === "ollama") return process.env.OLLAMA_API_KEY || "";
  return "";
}

function getEnvModel(provider: Provider) {
  if (provider === "anthropic") return process.env.ANTHROPIC_MODEL || DEFAULT_MODELS.anthropic;
  if (provider === "openai") return process.env.OPENAI_MODEL || DEFAULT_MODELS.openai;
  if (provider === "ollama") return process.env.OLLAMA_MODEL || DEFAULT_MODELS.ollama;
  return DEFAULT_MODELS[provider];
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function providerError(provider: Provider, resp: Response, body: unknown) {
  const message =
    body && typeof body === "object" && "error" in body
      ? JSON.stringify((body as { error: unknown }).error)
      : typeof body === "string"
      ? body
      : resp.statusText;
  return new Error(`${provider} ${resp.status}: ${message}`);
}

async function readJson(resp: Response) {
  const text = await resp.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function recordUsage(workspaceId: string, tokens: number | null | undefined) {
  if (!tokens || !Number.isFinite(tokens) || tokens <= 0) return;
  await db.aIConfig
    .update({ where: { workspaceId }, data: { tokensUsed: { increment: Math.round(tokens) } } })
    .catch(() => null);
}

/**
 * Run a completion with the workspace's AI config. Falls back to a mock
 * response when no provider key is available.
 */
export async function complete(
  workspaceId: string,
  system: string,
  user: string,
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<AIResult> {
  const cfg = await getAIConfig(workspaceId);
  const { provider, key, model, baseUrl } = resolveAI(cfg);

  // Ollama path: self-hosted (base URL, no key) or Cloud (API key, base URL
  // defaults to https://ollama.com). Both speak the same /api/chat protocol.
  if (provider === "ollama") {
    // baseUrl is "" only for a keyless install with no URL — stay mocked.
    if (!baseUrl) {
      return { text: mockResponse(user), mocked: true, provider: "mock" };
    }
    try {
      const resp = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({
          model,
          stream: false,
          // Ollama exposes temperature inside options.* — same nesting as
          // num_predict. Falls through to the model default when caller
          // doesn't pass one.
          options: {
            num_predict: opts.maxTokens ?? 600,
            ...(typeof opts.temperature === "number" ? { temperature: opts.temperature } : {}),
          },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      const json: any = await readJson(resp);
      if (!resp.ok) throw providerError(provider, resp, json);
      const text: string = json?.message?.content || json?.response || "";
      if (!text.trim()) throw new Error("ollama returned an empty response");
      await recordUsage(workspaceId, (json?.prompt_eval_count || 0) + (json?.eval_count || 0));
      return { text, mocked: false, provider };
    } catch (e) {
      console.error("[ai] ollama call failed:", e);
      return { text: mockResponse(user), mocked: true, provider: "mock" };
    }
  }

  if (!key) {
    return { text: mockResponse(user), mocked: true, provider: "mock" };
  }

  if (provider === "anthropic") {
    try {
      const client = new Anthropic({ apiKey: key });
      const resp = await client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 600,
        // Anthropic defaults to 1.0, which is fine for prose generation
        // (drafts, summaries) but too random for strict-JSON callers that
        // need stable outputs across builds. Default unchanged; callers
        // who care pass an explicit value.
        ...(typeof opts.temperature === "number" ? { temperature: opts.temperature } : {}),
        system,
        messages: [{ role: "user", content: user }],
      });
      const text = resp.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("");
      // Count tokens (best-effort).
      await recordUsage(workspaceId, (resp.usage?.input_tokens ?? 0) + (resp.usage?.output_tokens ?? 0));
      return { text, mocked: false, provider };
    } catch (e) {
      console.error("[ai] anthropic call failed:", e);
      return { text: mockResponse(user), mocked: true, provider: "mock" };
    }
  }

  if (provider === "openai") {
    try {
      const baseUrl = trimTrailingSlash(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1");
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? 600,
          // Caller-supplied wins; otherwise keep the existing 0.3 default
          // that the prose helpers rely on.
          temperature: typeof opts.temperature === "number" ? opts.temperature : 0.3,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      const json: any = await readJson(resp);
      if (!resp.ok) throw providerError(provider, resp, json);

      const text: string = json?.choices?.[0]?.message?.content || "";
      if (!text.trim()) throw new Error("openai returned an empty response");
      await recordUsage(
        workspaceId,
        json?.usage?.total_tokens ??
          ((json?.usage?.prompt_tokens || 0) + (json?.usage?.completion_tokens || 0)),
      );
      return { text, mocked: false, provider };
    } catch (e) {
      console.error("[ai] openai call failed:", e);
      return { text: mockResponse(user), mocked: true, provider: "mock" };
    }
  }

  // Google is listed in the UI, but not implemented yet.
  return { text: mockResponse(user), mocked: true, provider: "mock" };
}

function mockResponse(user: string): string {
  // Pretty deterministic mock so the UI feels alive without a key.
  if (user.toLowerCase().includes("draft a reply")) {
    return [
      "Hi —",
      "",
      "Thanks so much for getting in touch. I really enjoyed reading about your work; the way you've handled dense interfaces is exactly the sort of thinking we're looking for.",
      "",
      "I'd love to set up a first chat. Are you free for 30 minutes later this week? Tuesday or Thursday afternoon (CET) would work well on our side.",
      "",
      "Warmly,\nMaya",
    ].join("\n");
  }
  if (user.toLowerCase().includes("summary")) {
    return [
      "Strong, systems-oriented designer with 6+ years in B2B fintech.",
      "Portfolio leans heavily on dense data UI — directly relevant to our credit console.",
      "Available in CET; open to hybrid in Berlin. Worth moving to phone screen.",
    ].join(" ");
  }
  if (user.toLowerCase().includes("rewrite") || user.toLowerCase().includes("job description")) {
    return "We're hiring a senior product designer to own the credit decisioning console used by risk teams at our partner banks. You'll set patterns, ship features, and shape how design works at goscore — alongside engineers and modellers who care a lot about clarity.";
  }
  return "Here is a thoughtful response. (Configure Anthropic, OpenAI, or Ollama in Settings -> AI to switch from mocked to real AI output.)";
}

// ── Common task helpers ──────────────────────────────────────────────
export async function summarizeCandidate(
  workspaceId: string,
  payload: {
    name: string;
    resume: string;
    jobTitle: string;
    jobDescription?: string | null;
    requirements?: string[] | null;
  },
) {
  const system =
    "You are a kind, sharp recruiting copilot for an ATS called Vellum. Generate short, factual candidate summaries for hiring managers — never speculative, never gendered, never autocratic. Always 3 sentences max. Anchor every claim in the resume; if the resume is thin, say so plainly.";

  const jobBlock = [
    `Role: ${payload.jobTitle}`,
    payload.jobDescription ? `What the role is:\n${payload.jobDescription}` : null,
    payload.requirements?.length ? `Key requirements:\n- ${payload.requirements.join("\n- ")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const user = [
    "Write a 3-sentence summary for this candidate, focused on fit against the role.",
    "",
    jobBlock,
    "",
    `Candidate: ${payload.name}`,
    "Resume / context:",
    payload.resume || "(no resume text available — summarize from name + role only)",
  ].join("\n");

  return complete(workspaceId, system, user, { maxTokens: 10000 });
}

export async function draftReply(workspaceId: string, payload: { candidateName: string; lastMessage: string; stage: string }) {
  const system = "You write warm, specific recruiter replies on behalf of Vellum users. Match the tone of the candidate's message. Never auto-commit to interviews; offer options. Sign with the user's name.";
  const user = `Draft a reply.\nCandidate: ${payload.candidateName}\nCurrent stage: ${payload.stage}\nTheir last message:\n${payload.lastMessage}`;
  return complete(workspaceId, system, user, { maxTokens: 10000 });
}

export async function rewriteJobDescription(workspaceId: string, payload: { title: string; rough: string }) {
  const system = "You are an expert recruiting copywriter. Rewrite job descriptions to be warm, specific, and free of clichés. Keep it short (under 180 words) and end with a clear call to action.";
  const user = `Rewrite this job description for clarity and warmth.\n\nRole: ${payload.title}\n\nDraft:\n${payload.rough}`;
  return complete(workspaceId, system, user, { maxTokens: 10000 });
}

export type JobWizardResult = {
  pitch: string;
  description: string;
  requirements: string[];
  niceToHave: string[];
};

export async function generateJobWizard(
  workspaceId: string,
  payload: { title: string; prompt: string; tone: string },
) {
  const system = [
    "You are an expert recruiting copywriter for an ATS called Vellum.",
    "Your goal is to generate compelling, structured job postings based on a job title and a brief prompt.",
    `The tone should be ${payload.tone}.`,
    "- Pitch: A one-line hook that grabs attention.",
    "- Description: 2-3 paragraphs about the role and impact. Use markdown (bolding, etc.) but no headers.",
    "- Requirements: A list of specific qualifications. One per line in the output array.",
    "- Nice to have: A list of bonus skills or experience. One per line in the output array.",
    "",
    "Respond with a single JSON object ONLY. No prose, no markdown fences.",
    "Schema: { pitch: string, description: string, requirements: string[], niceToHave: string[] }",
  ].join("\n");

  const user = `Job Title: ${payload.title}\nUser Prompt: ${payload.prompt}`;

  const r = await complete(workspaceId, system, user, { maxTokens: 2000, temperature: 0.7 });

  if (r.mocked) {
    return {
      pitch: "Help us make lending feel obvious.",
      description: `We help banks make better lending decisions and bring tailor-made offers to consumers. As a ${payload.title} on our small but mighty team, you'll own the end-to-end experience of our core products.

You'll work closely with modellers and engineers to design interfaces that make complicated logic feel obvious. We care a lot about explainability: every screen should help our users understand why a decision was made.`,
      requirements: [
        "5+ years of relevant experience",
        "A portfolio of complex, data-dense interfaces",
        "Comfortable with ambiguity and opinionated about systems",
      ],
      niceToHave: ["Experience in regulated industries", "Prototyping in code"],
    };
  }

  try {
    let text = r.text.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }
    return JSON.parse(text) as JobWizardResult;
  } catch (e) {
    console.error("[ai] failed to parse job wizard json:", e);
    // Return a fallback or throw? For now fallback.
    return {
      pitch: "",
      description: r.text,
      requirements: [],
      niceToHave: [],
    };
  }
}

export type ResumeProfile = {
  currentRole?: string;
  years?: number;
  location?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
};

export type ResumeProfileResult = ResumeProfile & { mocked: boolean };

/**
 * Pull structured profile fields out of a parsed resume. Used by the apply
 * route to backfill `currentRole`, `years`, and link fields on candidates
 * who came in through the career site. Returns an empty object when the
 * provider is mocked or the JSON can't be parsed — callers must treat the
 * result as best-effort hints, never as ground truth.
 */
export async function extractResumeProfile(
  workspaceId: string,
  resumeText: string,
): Promise<ResumeProfileResult> {
  if (!resumeText.trim()) return { mocked: true };

  const system = [
    "You extract structured candidate profile data from resume text for an ATS.",
    "Reply with a single JSON object only — no prose, no fences.",
    "Schema: { currentRole?: string, years?: number, location?: string, linkedin?: string, github?: string, portfolio?: string }.",
    "- currentRole: the candidate's most recent job title (e.g. \"Senior Product Designer at Stripe\"). Omit if not stated.",
    "- years: integer count of years of relevant professional experience inferred from the work history. Omit if the resume doesn't make this estimable.",
    "- location: city / country if listed in the header. Omit otherwise.",
    "- linkedin / github / portfolio: full URLs if present. Omit if missing.",
    "Never invent values. Omit any field you're not confident in.",
  ].join("\n");

  const user = `Resume text:\n${resumeText.slice(0, 12_000)}`;

  const r = await complete(workspaceId, system, user, { maxTokens: 400, temperature: 0 });
  if (r.mocked) return { mocked: true };

  const parsed = parseResumeProfileJson(r.text);
  return { ...parsed, mocked: false };
}

function parseResumeProfileJson(text: string): ResumeProfile {
  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!cleaned.startsWith("{")) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) cleaned = m[0];
  }
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: ResumeProfile = {};
  const str = (k: string, max: number) => {
    const v = obj[k];
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return t.slice(0, max);
    }
    return undefined;
  };
  out.currentRole = str("currentRole", 180);
  out.location = str("location", 160);
  out.linkedin = str("linkedin", 300);
  out.github = str("github", 300);
  out.portfolio = str("portfolio", 300);
  const y = obj.years;
  if (typeof y === "number" && Number.isFinite(y) && y >= 0 && y <= 80) {
    out.years = Math.round(y);
  } else if (typeof y === "string") {
    const n = Number.parseInt(y, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 80) out.years = n;
  }
  return out;
}

export type ScreeningQuestionSuggestion = {
  q: string;
  type: "short" | "long" | "yes/no";
  reason: string;
};

/**
 * Suggest screening questions based on job posting details.
 */
export async function suggestScreeningQuestions(
  workspaceId: string,
  payload: { title: string; description: string; requirements: string[]; niceToHave: string[] },
) {
  const system = [
    "You are an expert recruiter helping to draft screening questions for a job posting.",
    "Based on the job title, description, and requirements, suggest up to 5 relevant screening questions.",
    "Each question should help filter for specific skills or traits mentioned in the JD.",
    "Keep questions concise and professional.",
    "Assign a type to each question: 'short', 'long', or 'yes/no'.",
    "Provide a brief (one sentence) reason why this question is relevant.",
    "",
    "Respond with a single JSON object ONLY. No prose, no markdown fences.",
    "Schema: { suggestions: Array<{ q: string, type: 'short' | 'long' | 'yes/no', reason: string }> }",
  ].join("\n");

  const user = [
    `Job Title: ${payload.title}`,
    `Description: ${payload.description}`,
    `Requirements:\n${payload.requirements.join("\n")}`,
    `Nice to have:\n${payload.niceToHave.join("\n")}`,
  ].join("\n\n");

  const r = await complete(workspaceId, system, user, { maxTokens: 1500, temperature: 0.7 });

  if (r.mocked) {
    return {
      suggestions: [
        { q: "How many years of experience do you have with React?", type: "short", reason: "React is a core requirement for this role." },
        { q: "Have you ever worked in a regulated industry like fintech?", type: "yes/no", reason: "Experience with compliance is listed as a plus." },
        { q: "Tell us about a time you had to explain a complex technical concept to a non-technical stakeholder.", type: "long", reason: "Communication with diverse stakeholders is key for this position." },
        { q: "Do you have experience with Figma and design systems?", type: "yes/no", reason: "The role requires close collaboration with the design team." },
        { q: "What is your preferred approach to unit testing in a large codebase?", type: "long", reason: "Quality and testing are highlighted in the job description." },
      ]
    };
  }

  try {
    let text = r.text.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }
    const parsed = JSON.parse(text) as { suggestions: ScreeningQuestionSuggestion[] };
    return {
      suggestions: (parsed.suggestions || []).slice(0, 5)
    };
  } catch (e) {
    console.error("[ai] failed to parse screening questions suggestions json:", e);
    return { suggestions: [] };
  }
}
