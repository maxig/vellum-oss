// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import * as React from "react";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import SettingsView from "./SettingsView";
import { normalizeCookieConfig } from "@/lib/cookies";

export const dynamic = "force-dynamic";

function envProvider() {
  const provider = process.env.AI_PROVIDER;
  if (provider === "openai" || provider === "ollama" || provider === "anthropic") return provider;
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.OLLAMA_BASE_URL) return "ollama";
  return "anthropic";
}

function envModel(provider: string) {
  if (provider === "openai") return process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (provider === "ollama") return process.env.OLLAMA_MODEL || "llama3.1";
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
}

function hasEnvKey(provider: string) {
  if (provider === "openai") return !!process.env.OPENAI_API_KEY;
  if (provider === "ollama") return !!process.env.OLLAMA_API_KEY || !!process.env.OLLAMA_BASE_URL;
  return !!process.env.ANTHROPIC_API_KEY;
}

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
  const defaultAIProvider = envProvider();

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
      ai={
        ai
          ? {
              provider: ai.provider,
              model: ai.model,
              baseUrl: ai.baseUrl,
              hasKey: !!ai.apiKeyEncrypted || hasEnvKey(ai.provider),
              features: ai.features as Record<string, boolean>,
              redactPII: ai.redactPII,
              noLog: ai.noLog,
              cacheEnabled: ai.cacheEnabled,
              tokensUsed: ai.tokensUsed,
              tokensQuota: ai.tokensQuota,
              recapSettings: ai.recapSettings as Record<string, unknown>,
              reviewRules: ai.reviewRules as Record<string, unknown>,
            }
          : {
              provider: defaultAIProvider,
              model: envModel(defaultAIProvider),
              baseUrl: defaultAIProvider === "ollama" ? process.env.OLLAMA_BASE_URL || null : null,
              hasKey: hasEnvKey(defaultAIProvider),
              features: null,
              redactPII: null,
              noLog: null,
              cacheEnabled: null,
              tokensUsed: 0,
              tokensQuota: 100000,
              recapSettings: {},
              reviewRules: {},
            }
      }
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
    />
  );
}
