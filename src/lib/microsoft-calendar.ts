// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Microsoft 365 / Outlook.com calendar integration.
 *
 * CALENDAR_FEATURE.md §7. Auth via `@azure/msal-node`, API via the
 * stable `@microsoft/microsoft-graph-client` 3.x line (the newer
 * `@microsoft/msgraph-sdk` is still preview).
 *
 * Required env:
 *   - MICROSOFT_CLIENT_ID
 *   - MICROSOFT_CLIENT_SECRET
 *   - MICROSOFT_TENANT       (defaults to "common" — accepts personal + work)
 *   - MICROSOFT_REDIRECT_URI (defaults to `${APP_ORIGIN}/api/calendar/oauth/microsoft/callback`)
 */

import { ConfidentialClientApplication, type Configuration } from "@azure/msal-node";
import { Client as GraphClient } from "@microsoft/microsoft-graph-client";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

const SCOPES = ["openid", "profile", "offline_access", "User.Read", "Calendars.ReadWrite"];

export function microsoftConfigured(): boolean {
  return !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

function redirectUri(): string {
  const base = process.env.APP_ORIGIN || "http://localhost:3000";
  return process.env.MICROSOFT_REDIRECT_URI || `${base}/api/calendar/oauth/microsoft/callback`;
}

function msalConfig(): Configuration {
  return {
    auth: {
      clientId: process.env.MICROSOFT_CLIENT_ID || "",
      authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT || "common"}`,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
    },
  };
}

let _msal: ConfidentialClientApplication | null = null;
function msal(): ConfidentialClientApplication {
  if (!_msal) _msal = new ConfidentialClientApplication(msalConfig());
  return _msal;
}

export async function buildAuthUrl(state: string): Promise<string> {
  const url = await msal().getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri: redirectUri(),
    state,
    prompt: "select_account",
  });
  return url;
}

export async function exchangeCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  email: string;
  homeAccountId: string | null;
}> {
  const result = await msal().acquireTokenByCode({
    code,
    scopes: SCOPES,
    redirectUri: redirectUri(),
  });
  if (!result?.accessToken) throw new Error("Microsoft did not return an access token");

  // Pull a refresh token via the token cache (MSAL hides it but we need
  // it for our own persistence). Falls back to silent-token flow on read.
  let refreshToken: string | null = null;
  try {
    const cache = msal().getTokenCache();
    // Internal cache JSON contains RefreshToken entries; this is the
    // pragmatic way to extract one in v5 of msal-node.
    const ser: any = await cache.serialize();
    const parsed = typeof ser === "string" ? JSON.parse(ser) : ser;
    const rts = parsed?.RefreshToken;
    if (rts && typeof rts === "object") {
      const first = Object.values(rts)[0] as any;
      if (first?.secret) refreshToken = first.secret as string;
    }
  } catch {
    /* best-effort */
  }

  return {
    accessToken: result.accessToken,
    refreshToken,
    expiresAt: result.expiresOn || null,
    email: result.account?.username || "unknown@microsoft",
    homeAccountId: result.account?.homeAccountId || null,
  };
}

/**
 * Get a fresh access token for an account, refreshing via the stored
 * refresh token if needed.
 */
async function tokenFor(accountId: string): Promise<{ token: string; account: any }> {
  const account = await db.calendarAccount.findUnique({ where: { id: accountId } });
  if (!account || account.provider !== "microsoft") throw new Error("not a Microsoft account");
  const access = account.accessTokenEnc ? decryptSecret(account.accessTokenEnc) : "";
  const exp = account.tokenExpiresAt ? account.tokenExpiresAt.getTime() : 0;

  // Reuse if not expired and we still have at least 60 seconds.
  if (access && exp - Date.now() > 60_000) return { token: access, account };

  // Refresh.
  const refresh = account.refreshTokenEnc ? decryptSecret(account.refreshTokenEnc) : "";
  if (!refresh) throw new Error("no refresh token — user must reconnect Microsoft");
  const res = await msal().acquireTokenByRefreshToken({ refreshToken: refresh, scopes: SCOPES });
  if (!res?.accessToken) throw new Error("Microsoft refresh failed");

  // Persist new access token.
  await db.calendarAccount.update({
    where: { id: accountId },
    data: {
      accessTokenEnc: encryptSecret(res.accessToken),
      tokenExpiresAt: res.expiresOn || null,
    },
  });
  return { token: res.accessToken, account };
}

function graphFor(token: string): GraphClient {
  return GraphClient.init({
    authProvider: (done) => done(null, token),
  });
}

export async function pushInterview(
  accountId: string,
  payload: {
    interviewId: string;
    summary: string;
    htmlBody: string;
    startsAt: Date;
    endsAt: Date;
    timezone: string;
    location?: string | null;
    meetingUrl?: string | null;
    attendees: { email: string; name?: string }[];
  },
): Promise<{ externalEventId: string }> {
  const { token } = await tokenFor(accountId);
  const graph = graphFor(token);
  const body: any = {
    subject: payload.summary,
    body: { contentType: "HTML", content: payload.htmlBody },
    start: { dateTime: payload.startsAt.toISOString(), timeZone: payload.timezone },
    end: { dateTime: payload.endsAt.toISOString(), timeZone: payload.timezone },
    location: payload.location ? { displayName: payload.location } : undefined,
    attendees: payload.attendees.map((a) => ({
      emailAddress: { address: a.email, name: a.name || a.email },
      type: "required",
    })),
    isOnlineMeeting: !payload.meetingUrl,
    onlineMeetingProvider: payload.meetingUrl ? undefined : "teamsForBusiness",
    singleValueExtendedProperties: [
      {
        id: "String {00020329-0000-0000-C000-000000000046} Name vellumInterviewId",
        value: payload.interviewId,
      },
    ],
  };
  const res = await graph.api("/me/events").post(body);
  return { externalEventId: res.id };
}

export async function patchInterview(
  accountId: string,
  externalEventId: string,
  payload: Parameters<typeof pushInterview>[1],
) {
  const { token } = await tokenFor(accountId);
  const graph = graphFor(token);
  await graph.api(`/me/events/${externalEventId}`).patch({
    subject: payload.summary,
    body: { contentType: "HTML", content: payload.htmlBody },
    start: { dateTime: payload.startsAt.toISOString(), timeZone: payload.timezone },
    end: { dateTime: payload.endsAt.toISOString(), timeZone: payload.timezone },
    location: payload.location ? { displayName: payload.location } : undefined,
    attendees: payload.attendees.map((a) => ({
      emailAddress: { address: a.email, name: a.name || a.email },
      type: "required",
    })),
  });
}

export async function cancelInterview(accountId: string, externalEventId: string) {
  const { token } = await tokenFor(accountId);
  const graph = graphFor(token);
  // Use DELETE — Graph still notifies attendees because the event had isOrganizer=true on our side.
  await graph.api(`/me/events/${externalEventId}`).delete();
}

export async function freeBusy(
  accountId: string,
  from: Date,
  to: Date,
): Promise<{ startsAt: Date; endsAt: Date }[]> {
  const { token, account } = await tokenFor(accountId);
  const graph = graphFor(token);
  const res = await graph.api("/me/calendar/getSchedule").post({
    schedules: [account.email],
    startTime: { dateTime: from.toISOString(), timeZone: "UTC" },
    endTime: { dateTime: to.toISOString(), timeZone: "UTC" },
    availabilityViewInterval: 30,
  });
  // Each schedule has `scheduleItems[]` with start/end ISO. Use those rather
  // than parsing the availabilityView digit string.
  const items = (res?.value?.[0]?.scheduleItems || []) as any[];
  return items.map((i) => ({
    startsAt: new Date(i.start?.dateTime || ""),
    endsAt: new Date(i.end?.dateTime || ""),
  }));
}

export async function listEventsForMirror(
  accountId: string,
  from: Date,
  to: Date,
): Promise<{
  externalId: string;
  startsAt: Date;
  endsAt: Date;
  title: string | null;
  location: string | null;
  url: string | null;
  kind: "event" | "vellum_owned_echo";
}[]> {
  const { token } = await tokenFor(accountId);
  const graph = graphFor(token);
  const res = await graph
    .api(`/me/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}&$top=250`)
    .get();
  const events: any[] = res?.value || [];
  return events
    .filter((e) => !e.isCancelled && e.start?.dateTime && e.end?.dateTime)
    .map((e) => {
      // The extended property "vellumInterviewId" identifies our echoes.
      const vellumProp = (e.singleValueExtendedProperties || []).find((p: any) =>
        (p?.id as string)?.includes("vellumInterviewId"),
      );
      return {
        externalId: e.id,
        startsAt: new Date(e.start.dateTime + (e.start.timeZone ? "" : "Z")),
        endsAt: new Date(e.end.dateTime + (e.end.timeZone ? "" : "Z")),
        title: e.subject || null,
        location: e.location?.displayName || null,
        url: e.onlineMeeting?.joinUrl || e.webLink || null,
        kind: vellumProp ? ("vellum_owned_echo" as const) : ("event" as const),
      };
    });
}
