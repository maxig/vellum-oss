// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { probeAccount } from "@/lib/caldav";
import { assertPublicUrl, SsrfError } from "@/lib/ssrf";

const Body = z.object({
  serverUrl: z.string().url(),
  email: z.string().min(1),
  password: z.string().min(1),
  displayName: z.string().optional(),
  defaultCalendarUrl: z.string().optional(),
});

// Probe-only: list calendars so the user can pick a default before persisting.
const ProbeBody = z.object({
  serverUrl: z.string().url(),
  email: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const { workspace, user } = await requireWorkspace();
  const json = await req.json().catch(() => ({}));

  // SSRF guard: the server is about to connect to this URL. Reject targets that
  // resolve to private/link-local/reserved ranges before probing or persisting.
  if (typeof json.serverUrl === "string" && json.serverUrl) {
    try {
      await assertPublicUrl(json.serverUrl);
    } catch (e) {
      const msg = e instanceof SsrfError ? e.message : "Invalid server URL";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  // If no defaultCalendarUrl is provided, treat this as a probe + return the list.
  if (!json.defaultCalendarUrl) {
    const parsed = ProbeBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
    try {
      const result = await probeAccount({
        serverUrl: parsed.data.serverUrl,
        username: parsed.data.email,
        password: parsed.data.password,
      });
      return NextResponse.json({ probe: true, calendars: result.calendars });
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message || "CalDAV connection failed" },
        { status: 400 },
      );
    }
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  // Verify the connection works before persisting.
  try {
    await probeAccount({
      serverUrl: parsed.data.serverUrl,
      username: parsed.data.email,
      password: parsed.data.password,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "CalDAV connection failed" },
      { status: 400 },
    );
  }

  await db.calendarAccount.upsert({
    where: {
      userId_provider_email: { userId: user.id, provider: "caldav", email: parsed.data.email },
    },
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      provider: "caldav",
      email: parsed.data.email,
      displayName: parsed.data.displayName || parsed.data.email,
      serverUrl: parsed.data.serverUrl,
      passwordEnc: encryptSecret(parsed.data.password),
      defaultCalendarUrl: parsed.data.defaultCalendarUrl,
      pollIntervalSec: 300,
    },
    update: {
      serverUrl: parsed.data.serverUrl,
      passwordEnc: encryptSecret(parsed.data.password),
      defaultCalendarUrl: parsed.data.defaultCalendarUrl,
      displayName: parsed.data.displayName || parsed.data.email,
      enabled: true,
      consecutiveErrors: 0,
      lastError: null,
    },
  });
  return NextResponse.json({ ok: true });
}
