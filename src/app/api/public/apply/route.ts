// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse, after } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";
import { sendOutboundEmail } from "@/lib/email";
import { sanitizeRichText } from "@/lib/sanitize";
import { parseResume } from "@/lib/resume";
import { isAIEnabled, summarizeCandidate, extractResumeProfile } from "@/lib/ai";
import { recordCareerEvent } from "@/lib/career-events";
import { recordStageMove } from "@/lib/stage-history";

export const runtime = "nodejs";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "bad form" }, { status: 400 });

  const jobId = String(form.get("jobId") || "");
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const linkedin = String(form.get("linkedin") || "");
  const portfolio = String(form.get("portfolio") || "");
  const location = String(form.get("location") || "");
  const whyUs = sanitizeRichText(String(form.get("whyUs") || ""));
  const screeningAnswers = (() : Prisma.InputJsonObject => {
    try {
      const raw = JSON.parse(String(form.get("screeningAnswers") || "{}"));
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

      const out: Record<string, Prisma.InputJsonValue | null> = {};
      for (const [k, v] of Object.entries(raw)) {
        out[k] = sanitizeScreeningAnswer(v);
      }
      return out;
    } catch {
      return {};
    }
  })();
  const resume = form.get("resume") as File | null;

  if (!name || !email || !jobId) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const job = await db.job.findUnique({ where: { id: jobId }, include: { workspace: true } });
  if (!job || job.status !== "Open") return NextResponse.json({ error: "Job is not accepting applications" }, { status: 404 });

  let resumeUrl: string | null = null;
  let resumeName: string | null = null;
  let resumeText: string | null = null;
  if (resume && resume.size > 0) {
    try {
      await mkdir(UPLOAD_DIR, { recursive: true });
      const ext = (resume.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "");
      const id = randomBytes(12).toString("hex");
      const filename = `${id}.${ext}`;
      const path = join(UPLOAD_DIR, filename);
      const buf = Buffer.from(await resume.arrayBuffer());
      await writeFile(path, buf);
      resumeUrl = `/uploads/${filename}`;
      resumeName = resume.name;

      try {
        const parsed = await parseResume({ buffer: buf, name: resume.name, mimeType: resume.type });
        if (parsed.text) resumeText = parsed.text;
      } catch (e) {
        // Parsing failures shouldn't block the application — the file is
        // already on disk and recruiters can review it manually.
        console.warn("[apply] resume parse failed:", (e as Error).message);
      }
    } catch (e) {
      console.error("[apply] resume upload failed:", e);
    }
  }

  // Find-or-create candidate. A returning applicant may have updated
  // their LinkedIn / portfolio / location since the previous application
  // — overwrite blanks with whatever they just submitted, but never wipe
  // an existing value when this form leaves the field empty. (Recruiter
  // edits made between applications stay intact because the form value
  // wins only when it's non-empty.)
  let candidate = await db.candidate.findFirst({ where: { workspaceId: job.workspaceId, email } });
  if (!candidate) {
    candidate = await db.candidate.create({
      data: {
        workspaceId: job.workspaceId,
        name,
        email,
        location: location || null,
        linkedin: linkedin || null,
        portfolio: portfolio || null,
        source: "Career site",
      },
    });
  } else {
    const patch: {
      linkedin?: string;
      portfolio?: string;
      location?: string;
    } = {};
    if (linkedin && linkedin !== candidate.linkedin) patch.linkedin = linkedin;
    if (portfolio && portfolio !== candidate.portfolio) patch.portfolio = portfolio;
    if (location && location !== candidate.location) patch.location = location;
    console.log("[apply] returning candidate", {
      id: candidate.id,
      email: candidate.email,
      form: { linkedin, portfolio, location },
      stored: { linkedin: candidate.linkedin, portfolio: candidate.portfolio, location: candidate.location },
      patch,
    });
    if (Object.keys(patch).length) {
      candidate = await db.candidate.update({ where: { id: candidate.id }, data: patch });
    }
  }

  const appliedStage = await db.stage.findFirst({ where: { workspaceId: job.workspaceId, key: "applied" } });

  // Avoid duplicate application. If the candidate is re-applying with a fresh
  // resume, update the existing record and re-run the AI summary so recruiters
  // aren't stuck with stale text.
  const existing = await db.application.findUnique({
    where: { candidateId_jobId: { candidateId: candidate.id, jobId: job.id } },
  });
  if (existing) {
    if (resumeUrl) {
      await db.application.update({
        where: { id: existing.id },
        data: { resumeUrl, resumeName, resumeText, aiSummary: null },
      });
      after(async () => {
        try {
          await enrichCandidateFromResume(candidate.id, job.workspaceId, resumeText);
          await generateApplicationSummary(existing.id, job.workspaceId);
        } catch (e) {
          console.warn("[apply] background summary failed:", (e as Error).message);
        }
      });
    }
    return NextResponse.json({ ok: true, duplicate: true, updated: !!resumeUrl });
  }

  const application = await db.application.create({
    data: {
      workspaceId: job.workspaceId,
      candidateId: candidate.id,
      jobId: job.id,
      stageId: appliedStage?.id || null,
      // Default the per-application reviewer to whoever owns the job.
      // Without this, every new application would land with no reviewer
      // and never surface in the recruiter's Review Queue "Mine" view.
      // Recruiters can reassign per-application from the candidate
      // profile sheet.
      reviewerId: job.leadReviewerId || null,
      resumeUrl,
      resumeName,
      resumeText,
      whyUs: whyUs || null,
      screeningAnswers: screeningAnswers as any,
      // GDPR consent is required by the apply form — record the timestamp
      // so the recap `missing_consent` item can flag legacy gaps cleanly.
      consentGivenAt: new Date(),
    },
  });

  // Stage history — `to_applied` from null. The recap relies on this for
  // stage_moves + median time-in-stage; the apply path is the genesis row.
  if (appliedStage) {
    await recordStageMove({
      workspaceId: job.workspaceId,
      applicationId: application.id,
      candidateId: candidate.id,
      jobId: job.id,
      fromStageId: null,
      fromStageKey: null,
      toStageId: appliedStage.id,
      toStageKey: appliedStage.key,
      actorId: null,
      actorName: candidate.name,
    });
  }

  // Career-site analytics — the form submission event. `apply_complete`
  // also fires when the thank-you page renders (more reliable for cases
  // where the user submits from outside the form widget), but tracking
  // `form_submit` here lets us catch the moment the data lands.
  await recordCareerEvent({
    workspaceId: job.workspaceId,
    kind: "form_submit",
    jobId: job.id,
    path: `/api/public/apply`,
  });

  // Kick off CV-driven profile enrichment + AI summary after the response is
  // sent. Enrichment must run before the summary so the summary prompt sees
  // the freshly extracted currentRole / years / location.
  after(async () => {
    try {
      await enrichCandidateFromResume(candidate.id, job.workspaceId, resumeText);
      await generateApplicationSummary(application.id, job.workspaceId);
    } catch (e) {
      console.warn("[apply] background summary failed:", (e as Error).message);
    }
  });

  // Activity + notification
  await db.activity.create({
    data: {
      workspaceId: job.workspaceId,
      actorName: name,
      kind: "applied",
      icon: "Users",
      body: `${name} applied for ${job.title}`,
      candidateId: candidate.id,
      jobId: job.id,
    },
  });
  const owners = await db.membership.findMany({ where: { workspaceId: job.workspaceId } });
  for (const m of owners) {
    await db.notification.create({
      data: {
        workspaceId: job.workspaceId,
        userId: m.userId,
        kind: "application",
        title: "New application",
        body: `${name} applied for ${job.title}`,
        candidateId: candidate.id,
        jobId: job.id,
        icon: "Users",
      },
    });
  }

  // Also start a system-thread acknowledging receipt
  const subject = `${job.title} — application received`;
  const ackBody = `Hi ${name.split(" ")[0] || name},

Thanks for applying to the ${job.title} role at ${job.workspace.name}. We've received your application and will review it within a few business days. If your background looks like a fit we'll be in touch from this address to set up a first conversation.

In the meantime, you don't need to do anything.

— ${job.workspace.name} hiring team`;

  const thread = await db.thread.create({
    data: {
      workspaceId: job.workspaceId,
      candidateId: candidate.id,
      jobId: job.id,
      subject,
      lastAt: new Date(),
    },
  });
  await db.message.create({
    data: {
      threadId: thread.id,
      direction: "system",
      body: ackBody,
    },
  });

  // Send a transactional confirmation by SMTP when the workspace has email
  // configured AND the recruiter hasn't turned auto-confirmations off in
  // settings. Failure is non-fatal — the in-app system message already gives
  // the candidate a record of the application, and we surface SMTP errors to
  // the recruiter via EmailAccount.lastError on the next poll.
  const wsDefaults = (job.workspace as any).defaults as Record<string, boolean> | null;
  const autoSendOn = !wsDefaults || wsDefaults.autoSendConfirmations !== false;
  try {
    const acct = await db.emailAccount.findUnique({ where: { workspaceId: job.workspaceId } });
    if (autoSendOn && acct?.enabled && email) {
      const { messageId } = await sendOutboundEmail(job.workspaceId, {
        to: email,
        subject,
        text: ackBody,
      });
      await db.message.create({
        data: {
          threadId: thread.id,
          direction: "out",
          body: ackBody,
          fromName: acct.fromName || job.workspace.name,
          externalMessageId: messageId || undefined,
        },
      });
    }
  } catch (e) {
    console.warn("[apply] confirmation email failed:", (e as Error).message);
    await db.emailAccount
      .updateMany({
        where: { workspaceId: job.workspaceId },
        data: { lastError: `Confirmation email to ${email} failed: ${(e as Error).message.slice(0, 400)}` },
      })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true, applicationId: application.id });
}

/**
 * Backfill candidate profile fields from the parsed resume. Only fills
 * blanks — never overwrites a value already on the candidate, so recruiter
 * edits and form-submitted links stay authoritative.
 */
async function enrichCandidateFromResume(
  candidateId: string,
  workspaceId: string,
  resumeText: string | null,
) {
  if (!resumeText || !resumeText.trim()) {
    console.log("[apply.enrich] skipped: no resume text", { candidateId, hasText: !!resumeText });
    return;
  }
  if (!(await isAIEnabled(workspaceId, "summary"))) {
    console.log("[apply.enrich] skipped: AI disabled for workspace", { candidateId, workspaceId });
    return;
  }

  const candidate = await db.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) {
    console.log("[apply.enrich] skipped: candidate not found", { candidateId });
    return;
  }

  const profile = await extractResumeProfile(workspaceId, resumeText);
  console.log("[apply.enrich] extracted", {
    candidateId,
    mocked: profile.mocked,
    profile,
    stored: {
      currentRole: candidate.currentRole,
      years: candidate.years,
      location: candidate.location,
      linkedin: candidate.linkedin,
      github: candidate.github,
      portfolio: candidate.portfolio,
    },
  });
  if (profile.mocked) return;

  const patch: {
    currentRole?: string;
    years?: number;
    location?: string;
    linkedin?: string;
    github?: string;
    portfolio?: string;
  } = {};
  if (!candidate.currentRole && profile.currentRole) patch.currentRole = profile.currentRole;
  if (candidate.years == null && typeof profile.years === "number") patch.years = profile.years;
  if (!candidate.location && profile.location) patch.location = profile.location;
  if (!candidate.linkedin && profile.linkedin) patch.linkedin = profile.linkedin;
  if (!candidate.github && profile.github) patch.github = profile.github;
  if (!candidate.portfolio && profile.portfolio) patch.portfolio = profile.portfolio;

  if (!Object.keys(patch).length) {
    console.log("[apply.enrich] no fields to fill (all already set or AI returned nothing)", { candidateId });
    return;
  }

  await db.candidate.update({ where: { id: candidateId }, data: patch });
  console.log("[apply.enrich] patched", { candidateId, patch });
  await db.activity.create({
    data: {
      workspaceId,
      kind: "ai",
      icon: "Sparkle",
      body: `AI filled ${Object.keys(patch).join(", ")} from ${candidate.name}'s resume`,
      candidateId,
    },
  });
}

async function generateApplicationSummary(applicationId: string, workspaceId: string) {
  if (!(await isAIEnabled(workspaceId, "summary"))) return;

  const app = await db.application.findUnique({
    where: { id: applicationId },
    include: { candidate: true, job: true },
  });
  if (!app) return;

  const structured = [
    app.candidate.currentRole ? `Current role: ${app.candidate.currentRole}` : null,
    app.candidate.location ? `Location: ${app.candidate.location}` : null,
    app.candidate.years ? `Years of experience: ${app.candidate.years}` : null,
    Array.isArray(app.candidate.skills) && app.candidate.skills.length
      ? `Skills: ${(app.candidate.skills as string[]).join(", ")}`
      : null,
    app.whyUs ? `From their application:\n${app.whyUs}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const resumeBlob = [app.resumeText, structured].filter(Boolean).join("\n\n---\n\n");

  const requirements = Array.isArray(app.job.requirements)
    ? (app.job.requirements as unknown[]).filter((r): r is string => typeof r === "string")
    : [];

  const r = await summarizeCandidate(workspaceId, {
    name: app.candidate.name,
    resume: resumeBlob,
    jobTitle: app.job.title,
    jobDescription: app.job.description,
    requirements,
  });

  if (r.mocked) return; // don't persist mock text for new applications
  await db.application.update({ where: { id: applicationId }, data: { aiSummary: r.text } });

  await db.activity.create({
    data: {
      workspaceId,
      kind: "ai",
      icon: "Sparkle",
      body: `AI summary generated for ${app.candidate.name}`,
      candidateId: app.candidateId,
      jobId: app.jobId,
    },
  });
}

function sanitizeScreeningAnswer(value: unknown): Prisma.InputJsonValue | null {
  if (value === null) return null;

  if (typeof value === "string") return sanitizeRichText(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeScreeningAnswer(item));
  }

  if (typeof value === "object") {
    const out: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sanitizeScreeningAnswer(v);
    }
    return out;
  }

  return null;
}
