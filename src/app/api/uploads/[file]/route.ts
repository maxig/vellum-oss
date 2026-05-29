// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  await requireWorkspace();
  const { file } = await params;
  if (!/^[a-z0-9.]+$/i.test(file)) return new NextResponse("bad name", { status: 400 });
  try {
    const buf = await readFile(join(UPLOAD_DIR, file));
    const ext = file.split(".").pop()?.toLowerCase();
    const type = ext === "pdf" ? "application/pdf" : ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/octet-stream";
    return new NextResponse(buf, { headers: { "content-type": type, "content-disposition": `inline; filename="${file}"` } });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
