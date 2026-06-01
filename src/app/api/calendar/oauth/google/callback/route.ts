// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { exchangeCode } from "@/lib/google-calendar";
import { getAppOrigin } from "@/lib/app-host";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const settingsUrl = new URL("/settings?tab=calendar", getAppOrigin(req.url));
  if (error) {
    settingsUrl.searchParams.set("calendar_error", error);
    return NextResponse.redirect(settingsUrl);
  }
  if (!code || !state) {
    settingsUrl.searchParams.set("calendar_error", "missing_code_or_state");
    return NextResponse.redirect(settingsUrl);
  }

  const c = await cookies();
  const expected = c.get("vellum_oauth_google")?.value;
  c.delete("vellum_oauth_google");
  if (!expected || expected !== state) {
    settingsUrl.searchParams.set("calendar_error", "state_mismatch");
    return NextResponse.redirect(settingsUrl);
  }

  const { workspace, user } = await requireWorkspace();
  // Belt and braces: the state encodes workspace+user too.
  const [, wsFromState, userFromState] = state.split(".");
  if (wsFromState !== workspace.id || userFromState !== user.id) {
    settingsUrl.searchParams.set("calendar_error", "scope_mismatch");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const tokens = await exchangeCode(code);
    await db.calendarAccount.upsert({
      where: {
        userId_provider_email: { userId: user.id, provider: "google", email: tokens.email },
      },
      create: {
        workspaceId: workspace.id,
        userId: user.id,
        provider: "google",
        email: tokens.email,
        displayName: tokens.email,
        accessTokenEnc: encryptSecret(tokens.accessToken),
        refreshTokenEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
        tokenExpiresAt: tokens.expiresAt,
        defaultCalendarId: "primary",
      },
      update: {
        accessTokenEnc: encryptSecret(tokens.accessToken),
        ...(tokens.refreshToken && { refreshTokenEnc: encryptSecret(tokens.refreshToken) }),
        tokenExpiresAt: tokens.expiresAt,
        enabled: true,
        consecutiveErrors: 0,
        lastError: null,
      },
    });
    settingsUrl.searchParams.set("calendar_connected", "google");
  } catch (e) {
    console.warn("[oauth google] callback failed:", (e as Error).message);
    settingsUrl.searchParams.set("calendar_error", "exchange_failed");
  }
  return NextResponse.redirect(settingsUrl);
}
