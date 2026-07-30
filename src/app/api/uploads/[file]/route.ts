// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { isAdmin, canReadApplication } from "@/lib/permissions";

export const runtime = "nodejs";
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { workspace, user, membership } = await requireWorkspace();
  const { file } = await params;
  if (!/^[a-z0-9.]+$/i.test(file)) return new NextResponse("bad name", { status: 400 });

  // Authorize the file, not just the session. Every served file is a resume
  // referenced by an Application.resumeUrl; require that application to live in
  // the caller's workspace — otherwise any signed-in user of any tenant could
  // read any resume by guessing/replaying its URL (the filename is the only
  // other barrier, and it leaks via logs and Referer). For members we apply the
  // same per-application read rule the profile sheet uses, so a recruiter can
  // only pull resumes for candidates they're actually connected to.
  const resumeUrl = `/uploads/${file}`;
  const app = await db.application.findFirst({
    where: { workspaceId: workspace.id, resumeUrl },
    select: { id: true },
  });
  if (!app) return new NextResponse("not found", { status: 404 });
  if (!isAdmin(membership.role)) {
    const allowed = await canReadApplication(user.id, app.id, workspace.id, membership.role);
    if (!allowed) return new NextResponse("not found", { status: 404 });
  }

  try {
    const buf = await readFile(join(UPLOAD_DIR, file));
    const ext = file.split(".").pop()?.toLowerCase();
    const type = ext === "pdf" ? "application/pdf" : ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/octet-stream";
    return new NextResponse(buf, { headers: { "content-type": type, "content-disposition": `inline; filename="${file}"` } });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
