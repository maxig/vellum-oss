// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// /api/pulse/[candidateId] — full Pulse breakdown for one candidate.
// Used by the breakdown popover on the candidates list, the pipeline cards,
// and the candidate profile sheet's Pulse panel.

import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { canReadCandidate } from "@/lib/permissions";
import { getPulseBreakdown, recomputePulse } from "@/lib/pulse";

export async function GET(_req: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  const { workspace, user, membership } = await requireWorkspace();
  const { candidateId } = await params;
  if (!(await canReadCandidate(user.id, candidateId, workspace.id, membership.role))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const breakdown = await getPulseBreakdown(workspace.id, candidateId);
  if (!breakdown) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    ...breakdown,
    updatedAt: breakdown.updatedAt?.toISOString() || null,
    signals: breakdown.signals.map((s) => ({ ...s, at: s.at.toISOString() })),
  });
}

// POST forces a recompute — useful for the "Recompute" link in the popover
// after the recruiter has done something they expect to affect the score.
export async function POST(_req: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  const { workspace, user, membership } = await requireWorkspace();
  const { candidateId } = await params;
  if (!(await canReadCandidate(user.id, candidateId, workspace.id, membership.role))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const result = await recomputePulse(workspace.id, candidateId);
  return NextResponse.json(result);
}
