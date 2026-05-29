// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace, isAdmin } from "@/lib/workspace";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";

const Body = z.object({
  imapHost: z.string().min(1),
  imapPort: z.coerce.number().int().min(1).max(65535).default(993),
  imapUser: z.string().min(1),
  imapPassword: z.string().optional(), // blank = keep existing
  imapTls: z.boolean().default(true),
  smtpHost: z.string().min(1),
  smtpPort: z.coerce.number().int().min(1).max(65535).default(587),
  smtpUser: z.string().min(1),
  smtpPassword: z.string().optional(),
  smtpTls: z.boolean().default(true),
  fromAddress: z.string().email(),
  fromName: z.string().optional().nullable(),
  enabled: z.boolean().default(true),
});

export async function PUT(req: Request) {
  const { workspace, membership } = await requireWorkspace();
  if (!isAdmin(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad input", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const existing = await db.emailAccount.findUnique({ where: { workspaceId: workspace.id } });

  // If the user left password fields blank we keep what was already encrypted.
  const imapEnc = input.imapPassword
    ? encryptSecret(input.imapPassword)
    : existing?.imapPasswordEncrypted || "";
  const smtpEnc = input.smtpPassword
    ? encryptSecret(input.smtpPassword)
    : existing?.smtpPasswordEncrypted || "";

  if (!imapEnc || !smtpEnc) {
    return NextResponse.json({ error: "IMAP and SMTP passwords are required on first save." }, { status: 400 });
  }

  const data = {
    imapHost: input.imapHost,
    imapPort: input.imapPort,
    imapUser: input.imapUser,
    imapPasswordEncrypted: imapEnc,
    imapTls: input.imapTls,
    smtpHost: input.smtpHost,
    smtpPort: input.smtpPort,
    smtpUser: input.smtpUser,
    smtpPasswordEncrypted: smtpEnc,
    smtpTls: input.smtpTls,
    fromAddress: input.fromAddress,
    fromName: input.fromName || null,
    enabled: input.enabled,
  };

  await db.emailAccount.upsert({
    where: { workspaceId: workspace.id },
    create: { workspaceId: workspace.id, ...data },
    update: data,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const { workspace, membership } = await requireWorkspace();
  if (!isAdmin(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await db.emailAccount.delete({ where: { workspaceId: workspace.id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
