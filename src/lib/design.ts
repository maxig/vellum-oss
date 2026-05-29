// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

export const ACCENTS = {
  indigo:   { a1: "#5B8DEF", a2: "#7C5BEF", solid: "#6B73EF", label: "Indigo" },
  aurora:   { a1: "#FF8AC6", a2: "#A78BFA", solid: "#A87BEF", label: "Aurora" },
  cyan:     { a1: "#22D3EE", a2: "#3B82F6", solid: "#2E96E8", label: "Cyan" },
  sage:     { a1: "#5EC9A0", a2: "#3D9A8A", solid: "#3D9A8A", label: "Sage" },
  graphite: { a1: "#5C6370", a2: "#2B2F38", solid: "#3A3F49", label: "Graphite" },
} as const;
export type AccentKey = keyof typeof ACCENTS;

export const DEFAULT_STAGES = [
  { key: "applied",   name: "Applied",      color: "oklch(70% 0.06 250)" },
  { key: "screen",    name: "Phone screen", color: "oklch(70% 0.13 220)" },
  { key: "interview", name: "Interview",    color: "oklch(72% 0.14 280)" },
  { key: "offer",     name: "Offer",        color: "oklch(72% 0.15 80)" },
  { key: "hired",     name: "Hired",        color: "oklch(68% 0.16 150)" },
  { key: "rejected",  name: "Rejected",     color: "oklch(70% 0.16 28)" },
];

export const AI_PROVIDERS = [
  { id: "anthropic", name: "Anthropic", desc: "Claude family — Haiku, Sonnet, Opus", models: ["claude-opus-4-8", "claude-sonnet-5", "claude-sonnet-4-6", "claude-haiku-4-5"], badge: "Recommended" },
  { id: "openai", name: "OpenAI", desc: "GPT-4 family + GPT-4o", models: ["gpt-5.5", "gpt-5.5-pro", "gpt-5.5-instant", "gpt-5.5-mini", "gpt-5.4-mini"], badge: null },
  { id: "google", name: "Google", desc: "Gemini 1.5 / 2.0", models: ["models/gemini-3.5-flash", "models/gemini-3.1-pro", "models/gemini-3.1-flash-lite"], badge: null },
  { id: "ollama", name: "Self-hosted (Ollama)", desc: "Run models locally — no data leaves your network", models: ["gemma4:e4b-mlx", "llama-3.1-70b", "mixtral-8x7b", "qwen-2.5-72b", "gemma4:31b-cloud"], badge: "Open source" },
] as const;

export const AI_FEATURES = [
  { id: "summary",   name: "Candidate summaries",       desc: "Generate AI fit scores and 3-sentence summaries from resumes." },
  { id: "draft",     name: "Reply drafts",              desc: "Draft warm, role-specific replies HR can edit before sending." },
  { id: "jd",        name: "Job description writer",    desc: "Generate job posts from a few sentences in your tone of voice." },
  { id: "screen",    name: "Screening question suggester", desc: "Suggest questions based on the role description." },
  { id: "rejection", name: "Rejection drafts",          desc: "Write kind, specific rejection notes for HR to review." },
  { id: "recap",     name: "Today's recap",             desc: "Glanceable daily briefing on the dashboard. Powers weekly & monthly digests." },
  { id: "pulse",     name: "Candidate Pulse",           desc: "Engagement signal blending behavior with AI sentiment on inbound messages." },
  { id: "review_queue", name: "Review queue insights",  desc: "Adds 1–4 cross-cutting AI items to the Review queue, below the rule-based ones." },
];
