// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Centralised access-control helpers.
 *
 * Every route that gates on more than "is this user in the workspace?"
 * should call one of these functions instead of inlining a role check.
 * The full rule table lives in ROLES.md at the repo root — this file
 * is the executable form.
 *
 * Three workspace roles:
 *   - owner   workspace creator. Manages other owners, deletes the
 *             workspace, plus everything an admin can do.
 *   - admin   manages settings (AI, career site, email), invites and
 *             removes teammates (except owners), edits any job's
 *             leadReviewer + hiring team, deletes jobs/candidates.
 *   - member  day-to-day recruiter. By default sees only candidates
 *             they're connected to (reviewer, hiring team, interviewer).
 *             A member on a job's hiring team can read its candidates,
 *             add notes, and write debriefs on interviews they're
 *             scheduled into. Cannot publish, delete, or transfer
 *             ownership of jobs.
 *
 * Hiring team and interviewer relationships are independent (a user
 * can be either, both, or neither). See ROLES.md §3.
 */

import { db } from "@/lib/db";

export type Role = "owner" | "admin" | "member";

export function isAdmin(role: string): boolean {
  return role === "owner" || role === "admin";
}

export function isOwner(role: string): boolean {
  return role === "owner";
}

/**
 * Can this user read the application's data (profile sheet, notes,
 * thread, interviews)? Allowed when ANY of these is true:
 *   - they're an admin/owner of the workspace
 *   - they're the assigned reviewer on the application
 *   - they're on the hiring team for the application's job
 *   - they're an interviewer scheduled on any of this application's interviews
 *
 * Members who don't match any of those see "not found".
 */
export async function canReadApplication(
  userId: string,
  applicationId: string,
  workspaceId: string,
  role: Role | string,
): Promise<boolean> {
  if (isAdmin(role)) return true;
  const app = await db.application.findFirst({
    where: { id: applicationId, workspaceId },
    select: {
      reviewerId: true,
      job: { select: { hiringTeam: { where: { userId }, select: { id: true } } } },
      interviews: {
        select: { participants: { where: { userId }, select: { id: true } } },
      },
    },
  });
  if (!app) return false;
  if (app.reviewerId === userId) return true;
  if (app.job.hiringTeam.length > 0) return true;
  if (app.interviews.some((iv) => iv.participants.length > 0)) return true;
  return false;
}

/**
 * Can this user read this candidate's data (Pulse, AI summary, to-dos,
 * thread drafts)? Candidate-level analogue of canReadApplication: true when
 * they're an admin, or connected to ANY of the candidate's applications
 * (reviewer, hiring team, or interviewer). One indexed query.
 */
export async function canReadCandidate(
  userId: string,
  candidateId: string,
  workspaceId: string,
  role: Role | string,
): Promise<boolean> {
  if (isAdmin(role)) return true;
  const app = await db.application.findFirst({
    where: {
      candidateId,
      workspaceId,
      OR: [
        { reviewerId: userId },
        { job: { hiringTeam: { some: { userId } } } },
        { interviews: { some: { participants: { some: { userId } } } } },
      ],
    },
    select: { id: true },
  });
  return !!app;
}

/**
 * Can this user write to the application (move stages, archive,
 * change reviewer)? Stricter than read:
 *   - admins/owners always can
 *   - the assigned reviewer can
 *   - hiring team members CANNOT change stage (that's a recruiter
 *     decision); they can only annotate via notes + debriefs
 *
 * Note: this is the rule today. If we promote a "hiring manager"
 * role-equivalent in the future (Q3 in the role-design discussion),
 * they'd flip to a yes here.
 */
export async function canEditApplication(
  userId: string,
  applicationId: string,
  workspaceId: string,
  role: Role | string,
): Promise<boolean> {
  if (isAdmin(role)) return true;
  const app = await db.application.findFirst({
    where: { id: applicationId, workspaceId },
    select: { reviewerId: true },
  });
  return !!app && app.reviewerId === userId;
}

/**
 * Can this user manage the job itself (publish, edit description,
 * change lead reviewer, edit the hiring team)? Admin/owner only.
 */
export function canManageJob(role: Role | string): boolean {
  return isAdmin(role);
}

/**
 * Can this user write a debrief on this interview? Anyone in the
 * workspace can — but the UI surfaces the button primarily to:
 *   - the interview's participants (own debrief)
 *   - the application's reviewer (so they can record the outcome
 *     even if the interviewer is slow)
 *   - admins/owners
 *
 * Returning true broadly here keeps the modal flexible; the API
 * stamps `authorId` from the session, so the audit trail is honest
 * regardless of who clicked.
 */
export async function canWriteDebrief(
  userId: string,
  interviewId: string,
  workspaceId: string,
  role: Role | string,
): Promise<boolean> {
  if (isAdmin(role)) return true;
  const iv = await db.interview.findFirst({
    where: { id: interviewId, workspaceId },
    select: {
      participants: { where: { userId }, select: { id: true } },
      application: { select: { reviewerId: true } },
    },
  });
  if (!iv) return false;
  if (iv.participants.length > 0) return true;
  if (iv.application.reviewerId === userId) return true;
  return false;
}

/**
 * Can this user see "Whole workspace" scope in the Review Queue?
 * Owner/admin only — members are pinned to "Mine". See
 * REVIEW_QUEUE_FEATURE.md §6.2 and ROLES.md §4.
 */
export function canSeeWorkspaceQueue(role: Role | string): boolean {
  return isAdmin(role);
}
