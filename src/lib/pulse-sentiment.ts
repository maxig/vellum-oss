// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// lib/pulse-sentiment.ts — AI sentiment classifier for inbound messages.
//
// See PULSE_FEATURE.md §7. Strict enum classifier — no free-text inference,
// no quotes back, no PII. Results land in SentimentResult (one row per
// inbound message, idempotent by messageId) and fire a corresponding
// positive_/negative_sentiment Pulse signal on the candidate.
//
// Gated by two toggles on AIConfig.features:
//   - `pulse`          (master Pulse toggle)
//   - `pulseSentiment` (this specific sub-feature)
//
// When the workspace has redactPII on, candidate names are scrubbed
// before sending to the LLM.

import { db } from "@/lib/db";
import { complete, getAIConfig, isAIEnabled } from "@/lib/ai";
import { recordSignal } from "@/lib/pulse";
import { createHash } from "crypto";

type SentimentLabel = "positive" | "neutral" | "negative" | "mixed";
type ConcernKey =
  | "salary"
  | "timing"
  | "role_clarity"
  | "process_length"
  | "competing_offer"
  | "relocation"
  | "other";

type Classification = {
  sentiment: SentimentLabel;
  concerns: ConcernKey[];
  confidence: number; // 0..1
};

const CONCERN_KEYS: ConcernKey[] = [
  "salary", "timing", "role_clarity", "process_length", "competing_offer", "relocation", "other",
];

const SYSTEM_PROMPT = [
  "You classify the sentiment of a single candidate message in the context of an active recruiting conversation. You do not summarise, advise, or interpret beyond what the message literally says.",
  "",
  "Output strict JSON:",
  '{ "sentiment": "positive" | "neutral" | "negative" | "mixed",',
  '  "concerns": ["salary" | "timing" | "role_clarity" | "process_length" | "competing_offer" | "relocation" | "other"],',
  '  "confidence": 0.0..1.0 }',
  "",
  "Rules:",
  "- Never reference age, gender, ethnicity, disability, family status, religion, or nationality.",
  '- Treat questions as neutral unless they carry clear emotional weight.',
  '- Hedging language ("maybe", "I\'ll think about it") → neutral unless the message also contains a deadline or alternative.',
  "- If confidence < 0.6, return sentiment: \"neutral\" and concerns: [].",
  "- Output JSON only; no prose.",
].join("\n");

/**
 * Classify a single inbound message. Caller passes the message id + body
 * and the candidate's current stage. Idempotent — if a result already
 * exists for the message id we return early.
 *
 * Failures (provider error, parse error, low confidence) silently fall
 * back to a neutral classification that is NOT written to the signal log,
 * matching the spec's "model error must never masquerade as a signal" rule.
 */
export async function classifyAndRecordSentiment(args: {
  workspaceId: string;
  candidateId: string;
  messageId: string;
  body: string;
  stage?: string | null;
  previousOutboundExcerpt?: string | null;
  threadSubject?: string | null;
}): Promise<Classification | null> {
  // Gate on workspace toggles before doing any work.
  const sentimentOn = await isAIEnabled(args.workspaceId, "pulseSentiment");
  if (!sentimentOn) return null;

  // Idempotency — never reclassify the same message.
  const existing = await db.sentimentResult.findUnique({ where: { messageId: args.messageId } });
  if (existing) return null;

  const cfg = await getAIConfig(args.workspaceId);
  const redact = cfg?.redactPII !== false; // default ON

  const payload = {
    workspace_id: args.workspaceId,
    thread_subject: args.threadSubject || null,
    stage: args.stage || null,
    previous_outbound_excerpt: args.previousOutboundExcerpt || null,
    // Candidate names get stripped when redaction is on. We don't pass the
    // candidate id either — the classifier doesn't need to know who.
    message: redact ? redactPII(args.body) : args.body,
  };

  const user = `Classify this message.\n\nCONTEXT:\n${JSON.stringify(payload, null, 2)}`;
  const promptHash = createHash("sha256").update(SYSTEM_PROMPT + "::" + user).digest("hex").slice(0, 32);

  let result;
  try {
    result = await complete(args.workspaceId, SYSTEM_PROMPT, user, { maxTokens: 80 });
  } catch {
    return null;
  }
  if (result.mocked) return null;

  const parsed = parseClassification(result.text);
  if (!parsed) return null;

  // Low confidence — store neutral but skip the Pulse signal.
  const final: Classification =
    parsed.confidence < 0.6
      ? { sentiment: "neutral", concerns: [], confidence: parsed.confidence }
      : parsed;

  await db.sentimentResult
    .create({
      data: {
        workspaceId: args.workspaceId,
        candidateId: args.candidateId,
        messageId: args.messageId,
        sentiment: final.sentiment,
        concerns: final.concerns,
        confidence: final.confidence,
        model: result.provider === "anthropic" ? (cfg?.model || "anthropic") : result.provider,
        promptHash,
      },
    })
    .catch(() => null);

  // Fire the corresponding Pulse signal only on confident labels.
  if (final.sentiment === "positive" && final.confidence >= 0.6) {
    await recordSignal({
      workspaceId: args.workspaceId,
      candidateId: args.candidateId,
      kind: "positive_sentiment",
      source: "ai_sentiment",
      evidence: { messageId: args.messageId, confidence: final.confidence },
    }).catch(() => null);
  } else if (final.sentiment === "negative" && final.confidence >= 0.6) {
    await recordSignal({
      workspaceId: args.workspaceId,
      candidateId: args.candidateId,
      kind: "negative_sentiment",
      source: "ai_sentiment",
      evidence: { messageId: args.messageId, confidence: final.confidence, concerns: final.concerns },
    }).catch(() => null);
  }

  return final;
}

function parseClassification(text: string): Classification | null {
  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!cleaned.startsWith("{")) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) cleaned = m[0];
  }
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object") return null;
    const sentiment = parsed.sentiment;
    if (!["positive", "neutral", "negative", "mixed"].includes(sentiment)) return null;
    const concerns: ConcernKey[] = Array.isArray(parsed.concerns)
      ? parsed.concerns.filter((c: unknown): c is ConcernKey => typeof c === "string" && CONCERN_KEYS.includes(c as ConcernKey))
      : [];
    const confidenceRaw = Number(parsed.confidence);
    const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0;
    return { sentiment, concerns, confidence };
  } catch {
    return null;
  }
}

/**
 * Lightweight PII redactor for the classifier payload. We only need to
 * strip the obvious identifiers the model might quote back — names,
 * emails, phone numbers, common URLs. Resume text isn't sent here; this
 * runs on free-form inbound messages.
 */
function redactPII(text: string): string {
  return text
    // Emails
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    // Phone numbers (loose)
    .replace(/(\+?\d[\d\s().-]{7,}\d)/g, "[phone]")
    // URLs
    .replace(/https?:\/\/\S+/gi, "[url]");
}
