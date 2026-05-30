// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import { requireWorkspace } from "@/lib/workspace";
import { publicScheme } from "@/lib/app-host";
import { db } from "@/lib/db";
import SettingsView from "./SettingsView";
import { normalizeCookieConfig } from "@/lib/cookies";
import { effectiveAISettings } from "@/lib/ai";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { workspace, user, membership } = await requireWorkspace();
  const sp = await searchParams;

  const [careerSite, ai, emailAccount, members, invites] = await Promise.all([
    db.careerSite.findUnique({ where: { workspaceId: workspace.id } }),
    db.aIConfig.findUnique({ where: { workspaceId: workspace.id } }),
    db.emailAccount.findUnique({ where: { workspaceId: workspace.id } }),
    db.membership.findMany({
      where: { workspaceId: workspace.id },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    db.invite.findMany({
      where: { workspaceId: workspace.id, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  // Show what AI will actually run (the env may override a stale workspace
  // default), keeping the rest of the row's settings as stored.
  const aiEffective = effectiveAISettings(ai);

  return (
    <SettingsView
      tab={sp.tab || "workspace"}
      workspace={{
        id: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
        domain: workspace.domain,
        color: workspace.color,
        industry: workspace.industry,
        size: workspace.size,
        currency: workspace.currency || "EUR",
        departments: Array.isArray(workspace.departments) ? (workspace.departments as string[]) : [],
        timezone: workspace.timezone || "Europe/Berlin",
        signature: workspace.signature || "",
        defaults:
          workspace.defaults && typeof workspace.defaults === "object"
            ? (workspace.defaults as Record<string, boolean>)
            : {},
        cookieConfig: normalizeCookieConfig((workspace as { cookieConfig?: unknown }).cookieConfig),
      }}
      currentUser={{ id: user.id, name: user.name, email: user.email, role: membership.role, theme: user.preferences?.theme || "light", density: user.preferences?.density || "cozy", accent: user.preferences?.accent || "indigo", glassIntensity: user.preferences?.glassIntensity ?? 1.0 }}
      careerSite={careerSite ? {
        brand: careerSite.brand,
        hero: careerSite.hero,
        about: careerSite.about,
        values: careerSite.values,
        offices: careerSite.offices,
        stories: careerSite.stories,
        cta: careerSite.cta,
        footer: careerSite.footer,
        customDomain: careerSite.customDomain,
        verifiedAt: careerSite.verifiedAt?.toISOString() || null,
        publishedAt: careerSite.publishedAt?.toISOString() || null,
      } : null}
      ai={{
        provider: aiEffective.provider,
        model: aiEffective.model,
        baseUrl: aiEffective.baseUrl,
        hasKey: aiEffective.hasKey,
        features: (ai?.features as Record<string, boolean>) ?? null,
        redactPII: ai?.redactPII ?? null,
        noLog: ai?.noLog ?? null,
        cacheEnabled: ai?.cacheEnabled ?? null,
        tokensUsed: ai?.tokensUsed ?? 0,
        tokensQuota: ai?.tokensQuota ?? 100000,
        recapSettings: (ai?.recapSettings as Record<string, unknown>) ?? {},
        reviewRules: (ai?.reviewRules as Record<string, unknown>) ?? {},
      }}
      email={emailAccount ? {
        imapHost: emailAccount.imapHost,
        imapPort: emailAccount.imapPort,
        imapUser: emailAccount.imapUser,
        imapTls: emailAccount.imapTls,
        smtpHost: emailAccount.smtpHost,
        smtpPort: emailAccount.smtpPort,
        smtpUser: emailAccount.smtpUser,
        smtpTls: emailAccount.smtpTls,
        fromAddress: emailAccount.fromAddress,
        fromName: emailAccount.fromName,
        enabled: emailAccount.enabled,
        lastPolledAt: emailAccount.lastPolledAt?.toISOString() || null,
        lastError: emailAccount.lastError,
      } : null}
      members={members.map((m) => ({ id: m.id, role: m.role, user: { id: m.user.id, name: m.user.name, email: m.user.email } }))}
      invites={invites.map((i) => ({ id: i.id, email: i.email, role: i.role, token: i.token, expiresAt: i.expiresAt.toISOString() }))}
      publicDomain={process.env.PUBLIC_DOMAIN || "localhost:3000"}
      publicScheme={publicScheme()}
    />
  );
}
