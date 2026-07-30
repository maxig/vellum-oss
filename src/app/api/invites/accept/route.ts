// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

const Body = z.object({
  token: z.string().min(8),
  name: z.string().min(1),
  password: z.string().min(10, "Password must be at least 10 characters"),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { token, name, password } = parsed.data;

  const invite = await db.invite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invite is invalid or expired." }, { status: 400 });
  }

  const email = invite.email.toLowerCase();
  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    user = await db.user.create({
      data: { email, name, password: await hashPassword(password) },
    });
  } else if (!user.password) {
    user = await db.user.update({ where: { id: user.id }, data: { name, password: await hashPassword(password) } });
  }

  await db.membership.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId: invite.workspaceId } },
    create: { userId: user.id, workspaceId: invite.workspaceId, role: invite.role },
    update: {},
  });
  await db.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });

  return NextResponse.json({ ok: true });
}
