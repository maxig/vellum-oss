// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

/**
 * Google Calendar integration.
 *
 * CALENDAR_FEATURE.md §6. Uses the slimmer `@googleapis/calendar`
 * (avoids dragging in the umbrella `googleapis` bundle) plus
 * `google-auth-library` for OAuth + refresh.
 *
 * The OAuth flow:
 *   1. UI redirects to the URL returned by buildAuthUrl()
 *   2. Google redirects to `${APP_ORIGIN}/api/calendar/oauth/google/callback`
 *   3. callback handler calls exchangeCode() + persists a CalendarAccount
 *
 * Required env:
 *   - GOOGLE_CLIENT_ID
 *   - GOOGLE_CLIENT_SECRET
 *   - GOOGLE_REDIRECT_URI (defaults to `${APP_ORIGIN}/api/calendar/oauth/google/callback`)
 */

import { calendar, auth as gauth } from "@googleapis/calendar";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function redirectUri(): string {
  const base = process.env.APP_ORIGIN || "http://localhost:3000";
  return process.env.GOOGLE_REDIRECT_URI || `${base}/api/calendar/oauth/google/callback`;
}

function oauthClient() {
  return new gauth.OAuth2({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: redirectUri(),
  });
}

export function buildAuthUrl(state: string): string {
  const client = oauthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
    include_granted_scopes: true,
  });
}

export async function exchangeCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  email: string;
}> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) throw new Error("Google did not return an access token");

  // Pull the user's email from the id_token. The library decodes lazily.
  client.setCredentials(tokens);
  let email = "";
  try {
    const ticket = tokens.id_token
      ? await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID })
      : null;
    email = ticket?.getPayload()?.email || "";
  } catch {
    // fall through — we'll try the userinfo endpoint
  }
  if (!email) {
    try {
      const r = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (r.ok) {
        const j = (await r.json()) as { email?: string };
        email = j.email || "";
      }
    } catch {
      /* ignore */
    }
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || null,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    email: email || "unknown@google",
  };
}

/**
 * Return an OAuth2Client bound to this account's tokens. Refreshes
 * automatically when expired and persists the new access token back to
 * the DB.
 */
async function clientFor(accountId: string) {
  const account = await db.calendarAccount.findUnique({ where: { id: accountId } });
  if (!account || account.provider !== "google") throw new Error("not a Google account");
  const accessToken = account.accessTokenEnc ? decryptSecret(account.accessTokenEnc) : "";
  const refreshToken = account.refreshTokenEnc ? decryptSecret(account.refreshTokenEnc) : "";
  const client = oauthClient();
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: account.tokenExpiresAt ? account.tokenExpiresAt.getTime() : undefined,
  });
  // Persist refreshed tokens on the account row.
  client.on("tokens", async (next) => {
    const update: any = {};
    if (next.access_token) update.accessTokenEnc = encryptSecret(next.access_token);
    if (next.refresh_token) update.refreshTokenEnc = encryptSecret(next.refresh_token);
    if (next.expiry_date) update.tokenExpiresAt = new Date(next.expiry_date);
    if (Object.keys(update).length > 0) {
      await db.calendarAccount.update({ where: { id: accountId }, data: update }).catch(() => null);
    }
  });
  return { account, client, api: calendar({ version: "v3", auth: client }) };
}

/**
 * Push (insert) a Vellum interview into the user's Google primary
 * calendar. Returns the externalEventId so the caller can persist it.
 */
export async function pushInterview(
  accountId: string,
  payload: {
    interviewId: string;
    summary: string;
    description: string;
    startsAt: Date;
    endsAt: Date;
    timezone: string;
    location?: string | null;
    meetingUrl?: string | null;
    attendees: { email: string; name?: string }[];
  },
): Promise<{ externalEventId: string }> {
  const { account, api } = await clientFor(accountId);
  const res = await api.events.insert({
    calendarId: account.defaultCalendarId || "primary",
    sendUpdates: "all",
    conferenceDataVersion: payload.meetingUrl ? 0 : 1,
    requestBody: {
      summary: payload.summary,
      description: payload.description,
      start: { dateTime: payload.startsAt.toISOString(), timeZone: payload.timezone },
      end: { dateTime: payload.endsAt.toISOString(), timeZone: payload.timezone },
      location: payload.location || undefined,
      attendees: payload.attendees.map((a) => ({
        email: a.email,
        displayName: a.name,
        responseStatus: "needsAction",
      })),
      conferenceData: payload.meetingUrl
        ? undefined
        : { createRequest: { requestId: payload.interviewId, conferenceSolutionKey: { type: "hangoutsMeet" } } },
      extendedProperties: { private: { vellumInterviewId: payload.interviewId } },
    },
  });

  return { externalEventId: res.data.id || "" };
}

export async function patchInterview(
  accountId: string,
  externalEventId: string,
  payload: Parameters<typeof pushInterview>[1],
) {
  const { account, api } = await clientFor(accountId);
  await api.events.patch({
    calendarId: account.defaultCalendarId || "primary",
    eventId: externalEventId,
    sendUpdates: "all",
    requestBody: {
      summary: payload.summary,
      description: payload.description,
      start: { dateTime: payload.startsAt.toISOString(), timeZone: payload.timezone },
      end: { dateTime: payload.endsAt.toISOString(), timeZone: payload.timezone },
      location: payload.location || undefined,
      attendees: payload.attendees.map((a) => ({ email: a.email, displayName: a.name })),
    },
  });
}

export async function cancelInterview(accountId: string, externalEventId: string) {
  const { account, api } = await clientFor(accountId);
  await api.events.delete({
    calendarId: account.defaultCalendarId || "primary",
    eventId: externalEventId,
    sendUpdates: "all",
  });
}

export async function freeBusy(
  accountId: string,
  from: Date,
  to: Date,
): Promise<{ startsAt: Date; endsAt: Date }[]> {
  const { account, api } = await clientFor(accountId);
  const res = await api.freebusy.query({
    requestBody: {
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      items: [{ id: account.defaultCalendarId || "primary" }],
    },
  });
  const cal = res.data.calendars?.[account.defaultCalendarId || "primary"];
  return (cal?.busy || []).map((b) => ({
    startsAt: new Date(b.start || ""),
    endsAt: new Date(b.end || ""),
  }));
}

/**
 * List events in a window for the mirror table. Distinguishes our own
 * events (extendedProperties.private.vellumInterviewId) from genuine
 * external blocks via the `kind` field.
 */
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
  const { account, api } = await clientFor(accountId);
  const res = await api.events.list({
    calendarId: account.defaultCalendarId || "primary",
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: true,
    maxResults: 250,
    orderBy: "startTime",
  });
  const items = (res.data.items || []).filter(
    (e) => e.status !== "cancelled" && e.start?.dateTime && e.end?.dateTime,
  );
  return items.map((e) => ({
    externalId: e.id || "",
    startsAt: new Date(e.start!.dateTime!),
    endsAt: new Date(e.end!.dateTime!),
    title: e.summary || null,
    location: e.location || null,
    url: e.hangoutLink || e.htmlLink || null,
    kind: e.extendedProperties?.private?.vellumInterviewId ? "vellum_owned_echo" : "event",
  }));
}

export async function revokeToken(accountId: string) {
  try {
    const { client } = await clientFor(accountId);
    const creds = client.credentials;
    if (creds.access_token) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(creds.access_token)}`, {
        method: "POST",
      }).catch(() => null);
    }
  } catch {
    /* best-effort */
  }
}
