// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Review-queue AI overlay.
 *
 * Calls the configured LLM with a redacted view of the user's open
 * candidates, asks it to surface up to N cross-cutting items the
 * deterministic catalog can't express (cross-candidate comparisons,
 * cooling patterns, drift across similar roles), and returns them as
 * ReviewQueueItems ready to be merged into the queue.
 *
 * Hard contracts enforced here, not at the model:
 *   - severity capped at 3 (deterministic Urgents always rank higher)
 *   - action ∈ {message, schedule, complete} — never "decide" or "nudge"
 *     that would imply a rejection/advance decision
 *   - candidateId must exist in the input set — hallucinations dropped
 *   - duplicates with deterministic items dropped at merge time (here)
 *   - PII redaction reuses recap's anon_<n> tokenization
 *   - retry once on parse failure with a stricter system message
 *
 * The deterministic layer always wins. This file's output is a hint.
 */

import { db } from "@/lib/db";
import { complete, getAIConfig } from "@/lib/ai";
import {
  BUCKETS,
  type ReviewQueueItem,
  type BucketAction,
} from "@/lib/review-queue";

const MAX_TOKENS = 10000;

// Hard upper bound — even if rules.aiOverlay.maxItems somehow exceeds
// this, we truncate. Defensive against future config drift.
const ABSOLUTE_MAX = 4;

// Pinned low temperature so two consecutive builds on the same input
// don't flip-flop between "2 items" and "3 items" — the user perceives
// that as cache instability, not LLM non-determinism. 0 isn't safe on
// every provider (some clamp to a minimum), but 0.1 is stable in
// practice and still leaves a sliver of variety on genuinely tied
// candidates.
const OVERLAY_TEMPERATURE = 0.1;

type OverlayResult = {
  items: ReviewQueueItem[];
  state: "ok" | "disabled" | "error" | "empty";
  error: string | null;
};

type ParsedItem = {
  candidateId?: unknown;
  reason?: unknown;
  severity?: unknown;
  action?: unknown;
};
type ParsedAI = { items?: ParsedItem[]; no_findings?: boolean };

export async function buildAIOverlay(ctx: {
  workspaceId: string;
  maxItems: 1 | 2 | 3 | 4;
  deterministic: ReviewQueueItem[];
}): Promise<OverlayResult> {
  const { workspaceId, deterministic } = ctx;
  const maxItems = Math.min(ctx.maxItems, ABSOLUTE_MAX);

  // De-dupe target: any candidate already surfaced by the rule engine.
  // AI items referencing these get dropped after parsing — see §5 of
  // the spec, "No duplicates with deterministic buckets."
  const deterministicCandidateIds = new Set(deterministic.map((it) => it.candidateId));

  // Load the workspace-wide candidate pool. Scope is applied at READ
  // time (in the GET handler), not at build time — that way one cache
  // serves both "Mine" and "Whole workspace" views and toggling
  // between them never triggers a rebuild.
  const apps = await db.application.findMany({
    where: {
      workspaceId,
      archived: false,
      stage: { key: { notIn: ["hired", "rejected"] } },
    },
    include: {
      candidate: { select: { id: true, name: true, source: true } },
      stage: { select: { key: true, name: true } },
      job: {
        select: {
          id: true,
          title: true,
          department: true,
          // Denormalized onto AI items too so the Mine filter behaves
          // identically across deterministic and AI rows.
          hiringTeam: { select: { userId: true } },
        },
      },
      interviews: { select: { participants: { select: { userId: true } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 80,
  });
  if (apps.length === 0) {
    return { items: [], state: "empty", error: null };
  }

  // Reduce to a candidate ID set so we can reject hallucinated IDs.
  const validIds = new Set(apps.map((a) => a.candidateId));
  // Keep a name/stage lookup keyed by the real id — the model never
  // sees real names, but we use these when materializing items.
  const candidateById = new Map(
    apps.map((a) => [
      a.candidateId,
      {
        name: a.candidate.name,
        stageKey: a.stage?.key || "applied",
        stageName: a.stage?.name || "Applied",
        applicationId: a.id,
        applicationReviewerId: a.reviewerId,
        jobHiringTeamUserIds: a.job.hiringTeam.map((m) => m.userId),
        interviewerUserIds: Array.from(
          new Set(a.interviews.flatMap((iv) => iv.participants.map((p) => p.userId))),
        ),
      },
    ]),
  );

  // Redaction — same pattern as recap. If AIConfig.redactPII is on
  // (default), names become anon_<n> tokens and we reverse-resolve
  // when materializing items. We anonymize candidate IDs too so the
  // payload contains nothing that survives a prompt log.
  const cfg = await getAIConfig(workspaceId);
  const redact = cfg?.redactPII !== false;
  const anonByReal = new Map<string, string>();
  const tokenize = (realId: string) => {
    if (!redact) return realId;
    if (!anonByReal.has(realId)) anonByReal.set(realId, `anon_${anonByReal.size + 1}`);
    return anonByReal.get(realId)!;
  };
  const realByAnon = () => {
    const out = new Map<string, string>();
    for (const [real, anon] of anonByReal) out.set(anon, real);
    return out;
  };

  // Build the model's context. Includes the deterministic items so the
  // model can avoid duplicating them — duplication is *also* dropped on
  // the parse side as a backstop.
  const now = Date.now();
  const candidatesPayload = apps.map((a) => ({
    candidate_id: tokenize(a.candidateId),
    stage: a.stage?.key || "applied",
    days_in_stage: round((now - a.updatedAt.getTime()) / 86_400_000),
    days_since_applied: round((now - a.appliedAt.getTime()) / 86_400_000),
    ai_fit: a.aiFit ?? null,
    job_id: a.jobId,
    job_title: a.job.title,
    department: a.job.department || null,
    source: a.candidate.source || null,
  }));
  const deterministicPayload = deterministic.map((it) => ({
    candidate_id: tokenize(it.candidateId),
    bucket: it.bucketId,
    reason: it.reason,
  }));

  const system = [
    "You are Vellum's hiring-ops assistant. You read a recruiter's open candidates and surface a small set the recruiter should look at — patterns the rule engine below can't express.",
    "",
    "Hard rules:",
    `- Pick AT MOST ${maxItems} candidates. Fewer is fine. Empty is fine.`,
    "- Only pick from CONTEXT.candidates. Never invent ids.",
    "- Do NOT duplicate items already in CONTEXT.deterministic — those are already shown.",
    "- Focus on patterns: cross-candidate comparisons, drift across similar roles, cooling signals not captured by simple thresholds.",
    "- severity is one of 1, 2, 3. Even a strong AI find ranks below an urgent rule-based item.",
    "- action is one of 'message', 'schedule', 'complete'. Never 'decide' (don't tell humans who to advance or reject).",
    "- Never reference age, gender, ethnicity, disability, family status, or any protected attribute.",
    "- reason is ONE sentence ≤140 characters, plain text, no markdown.",
    "- Output strict JSON: {\"items\":[{\"candidateId\":string,\"reason\":string,\"severity\":1|2|3,\"action\":\"message\"|\"schedule\"|\"complete\"}],\"no_findings\"?:boolean}.",
    "- No prose outside JSON. If nothing stands out, return {\"items\":[],\"no_findings\":true}. Silence beats filler.",
  ].join("\n");

  const user = `CONTEXT:\n${JSON.stringify({ candidates: candidatesPayload, deterministic: deterministicPayload, redacted: redact }, null, 2)}`;

  // First attempt — pinned-low temperature so the item COUNT is stable
  // across consecutive builds. Without this, Anthropic at default 1.0
  // would flip-flop between "2 items" and "3 items" and the user would
  // perceive that as cache instability.
  let aiText: string;
  try {
    const r = await complete(workspaceId, system, user, {
      maxTokens: MAX_TOKENS,
      temperature: OVERLAY_TEMPERATURE,
    });
    if (r.mocked) {
      // No real provider wired — surface as disabled rather than error
      // so the UI shows the empty-overlay treatment instead of a banner.
      return { items: [], state: "disabled", error: null };
    }
    aiText = r.text;
  } catch (e) {
    return { items: [], state: "error", error: (e as Error).message };
  }

  let parsed = parse(aiText);
  if (!parsed) {
    // Retry once with a stricter reminder, matching recap's pattern.
    try {
      const retry = await complete(
        workspaceId,
        system,
        user + "\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY the JSON object — no fences, no commentary.",
        { maxTokens: MAX_TOKENS, temperature: OVERLAY_TEMPERATURE },
      );
      parsed = retry.mocked ? null : parse(retry.text);
    } catch (e) {
      return { items: [], state: "error", error: (e as Error).message };
    }
  }

  if (!parsed) {
    return { items: [], state: "error", error: "AI overlay returned unparseable JSON twice." };
  }

  if (parsed.no_findings || !Array.isArray(parsed.items) || parsed.items.length === 0) {
    return { items: [], state: "empty", error: null };
  }

  // Reverse the anon map so we can look up the real candidate by the
  // token the model returned.
  const reverse = realByAnon();
  const stageColor = (stageKey: string) =>
    // Cheap map — Stage colors live in the DB but we don't need to round-trip
    // to render the chip; the queue UI already knows the canonical OKLCH
    // strings via the deterministic catalog, but AI items can come from
    // any stage so we provide a reasonable default if the catalog hasn't
    // surfaced this stage in this build.
    deterministic.find((d) => d.candidate.stage === stageKey)?.candidate.stageColor ||
    "var(--accent-solid)";

  const aiBucket = BUCKETS.find((b) => b.id === "ai");
  const out: ReviewQueueItem[] = [];
  for (const raw of parsed.items) {
    if (out.length >= maxItems) break;
    const item = materialize(raw, {
      reverse,
      validIds,
      candidateById,
      deterministicCandidateIds,
      stageColor,
      defaultSeverity: aiBucket?.defaultSeverity ?? 3,
    });
    if (item) out.push(item);
  }

  if (out.length === 0) {
    // Every AI candidate was hallucinated or a duplicate.
    return { items: [], state: "empty", error: null };
  }
  return { items: out, state: "ok", error: null };
}

function materialize(
  raw: ParsedItem,
  ctx: {
    reverse: Map<string, string>;
    validIds: Set<string>;
    candidateById: Map<
      string,
      {
        name: string;
        stageKey: string;
        stageName: string;
        applicationId: string;
        applicationReviewerId: string | null;
        jobHiringTeamUserIds: string[];
        interviewerUserIds: string[];
      }
    >;
    deterministicCandidateIds: Set<string>;
    stageColor: (stageKey: string) => string;
    defaultSeverity: number;
  },
): ReviewQueueItem | null {
  if (typeof raw.candidateId !== "string") return null;
  if (typeof raw.reason !== "string") return null;
  const reason = raw.reason.trim().slice(0, 200);
  if (!reason) return null;

  // Resolve anon token → real id. If we're not redacting, the model
  // already got real ids.
  const resolved = ctx.reverse.get(raw.candidateId) || raw.candidateId;
  if (!ctx.validIds.has(resolved)) return null; // hallucination guard
  if (ctx.deterministicCandidateIds.has(resolved)) return null; // dedupe

  const meta = ctx.candidateById.get(resolved);
  if (!meta) return null;

  // Severity is capped at 3 server-side regardless of what the model
  // returned — see spec §5 "Severity capped at 3."
  let severity = ctx.defaultSeverity;
  if (typeof raw.severity === "number" && raw.severity >= 1 && raw.severity <= 3) {
    severity = Math.round(raw.severity);
  }

  // Action allowlist — anything outside the three permitted values
  // falls back to 'message' which is the safest "human picks it up" path.
  const action: BucketAction = isAllowedAction(raw.action) ? (raw.action as BucketAction) : "message";

  return {
    candidateId: resolved,
    applicationId: meta.applicationId,
    applicationReviewerId: meta.applicationReviewerId,
    jobHiringTeamUserIds: meta.jobHiringTeamUserIds,
    interviewerUserIds: meta.interviewerUserIds,
    bucketId: "ai",
    reason,
    urgent: false,
    severity,
    action,
    rank: 0, // assigned by rankAndDedupe in review-queue.ts
    candidate: {
      id: resolved,
      name: meta.name,
      stage: meta.stageKey,
      stageName: meta.stageName,
      stageColor: ctx.stageColor(meta.stageKey),
      avatarSeed: meta.name,
    },
  };
}

function isAllowedAction(v: unknown): v is "message" | "schedule" | "complete" {
  return v === "message" || v === "schedule" || v === "complete";
}

function parse(text: string): ParsedAI | null {
  // Tolerant of ```json fences and a tiny amount of prose around the
  // JSON. Mirrors parseAIRecap() in recap.ts so the two paths behave
  // identically when a model gets chatty.
  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!cleaned.startsWith("{")) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) cleaned = m[0];
  }
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.no_findings === true) return parsed as ParsedAI;
    if (!Array.isArray(parsed.items)) return null;
    return parsed as ParsedAI;
  } catch {
    return null;
  }
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
