// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";

const PROFILE_FIELDS = [
  "name",
  "title",
  "pronouns",
  "location",
  "timezone",
  "workingHours",
  "bio",
  "signature",
] as const;

const Patch = z.object({
  name: z.string().min(1).optional(),
  title: z.string().max(120).nullish(),
  pronouns: z.string().max(40).nullish(),
  location: z.string().max(120).nullish(),
  timezone: z.string().max(80).nullish(),
  workingHours: z.string().max(120).nullish(),
  bio: z.string().max(2000).nullish(),
  signature: z.string().max(2000).nullish(),
  password: z.string().min(6).optional(),
  notifications: z.record(z.string(), z.union([z.boolean(), z.string()])).optional(),
});

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  const userUpdates: Record<string, unknown> = {};
  for (const key of PROFILE_FIELDS) {
    if (key in d) {
      const value = (d as Record<string, unknown>)[key];
      userUpdates[key] = value === "" ? null : value;
    }
  }
  if (d.password) userUpdates.password = await hashPassword(d.password);
  if (Object.keys(userUpdates).length) {
    await db.user.update({ where: { id: session.user.id }, data: userUpdates });
  }

  if (d.notifications) {
    await db.userPreference.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, notifications: d.notifications },
      update: { notifications: d.notifications },
    });
  }

  return NextResponse.json({ ok: true });
}
