// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace, isAdmin } from "@/lib/workspace";
import { db } from "@/lib/db";
import { sanitizeRichText, stripHtml } from "@/lib/sanitize";
import { normalizeCustomDomain, isReservedDomain } from "@/lib/custom-domain";

const StringOrNull = z.union([z.string(), z.null()]).optional();

const HeroSchema = z
  .object({
    eyebrow: StringOrNull,
    headline_1: StringOrNull,
    headline_2: StringOrNull,
    lede: StringOrNull, // rich text
    cta_primary: StringOrNull,
    cta_secondary: StringOrNull,
  })
  .partial()
  .passthrough();

const AboutSchema = z
  .object({
    eyebrow: StringOrNull,
    headline: StringOrNull,
    body_1: StringOrNull, // rich text
    body_2: StringOrNull, // rich text
    stats: z.array(z.object({ n: z.string().optional(), l: z.string().optional() })).optional(),
  })
  .partial()
  .passthrough();

const ValueSchema = z.object({ t: z.string().default(""), b: z.string().default("") });

const OfficeSchema = z.object({
  city: z.string().default(""),
  country: z.string().default(""),
  address: z.string().default(""),
  employees: z.string().default(""),
});

const StorySchema = z.object({
  name: z.string().default(""),
  role: z.string().default(""),
  years: z.string().default(""),
  quote: z.string().default(""), // rich text
  photoUrl: z.string().default(""),
});

const CtaSchema = z
  .object({
    headline: StringOrNull,
    body: StringOrNull, // rich text
    button_1: StringOrNull,
    button_2: StringOrNull,
  })
  .partial()
  .passthrough();

const FooterSchema = z
  .object({
    email: StringOrNull,
    company: StringOrNull,
  })
  .partial()
  .passthrough();

const Patch = z.object({
  brand: z.any().optional(),
  hero: HeroSchema.optional(),
  about: AboutSchema.optional(),
  values: z.array(ValueSchema).optional(),
  offices: z.array(OfficeSchema).optional(),
  stories: z.array(StorySchema).optional(),
  cta: CtaSchema.optional(),
  footer: FooterSchema.optional(),
  customDomain: z.string().optional().nullable(),
});

export async function PATCH(req: Request) {
  const { workspace, membership } = await requireWorkspace();
  if (!isAdmin(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad input", details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  const data: any = { publishedAt: new Date() };

  if (input.brand !== undefined) data.brand = input.brand;
  if (input.hero !== undefined) {
    data.hero = {
      ...input.hero,
      // Rich-text field; sanitize.
      lede: input.hero.lede != null ? sanitizeRichText(input.hero.lede) : input.hero.lede,
    };
  }
  if (input.about !== undefined) {
    data.about = {
      ...input.about,
      body_1: input.about.body_1 != null ? sanitizeRichText(input.about.body_1) : input.about.body_1,
      body_2: input.about.body_2 != null ? sanitizeRichText(input.about.body_2) : input.about.body_2,
    };
  }
  if (input.values !== undefined) data.values = input.values;
  if (input.offices !== undefined) data.offices = input.offices;
  if (input.stories !== undefined) {
    data.stories = input.stories.map((s) => ({
      ...s,
      // Each story quote is rich text.
      quote: sanitizeRichText(s.quote),
    }));
  }
  if (input.cta !== undefined) {
    data.cta = {
      ...input.cta,
      body: input.cta.body != null ? sanitizeRichText(input.cta.body) : input.cta.body,
    };
  }
  if (input.footer !== undefined) {
    // Footer is plain-text only — strip any stray HTML.
    data.footer = {
      ...input.footer,
      email: input.footer.email != null ? stripHtml(input.footer.email) : input.footer.email,
      company: input.footer.company != null ? stripHtml(input.footer.company) : input.footer.company,
    };
  }
  if (input.customDomain !== undefined) {
    const raw = (input.customDomain ?? "").trim();
    if (!raw) {
      data.customDomain = null;
      data.verifiedAt = null;
    } else {
      const domain = normalizeCustomDomain(raw);
      if (!domain) {
        return NextResponse.json(
          { error: "That doesn't look like a domain. Use something like careers.yourcompany.com." },
          { status: 400 },
        );
      }
      if (isReservedDomain(domain)) {
        return NextResponse.json(
          { error: "That address is already used by Vellum itself. Pick a domain you own." },
          { status: 400 },
        );
      }
      const claimed = await db.careerSite.findUnique({
        where: { customDomain: domain },
        select: { workspaceId: true },
      });
      if (claimed && claimed.workspaceId !== workspace.id) {
        return NextResponse.json(
          { error: "Another workspace is already using that domain." },
          { status: 409 },
        );
      }
      data.customDomain = domain;
      // Pointing at a different host means the old proof of a live CNAME no
      // longer applies; /api/public/domain-check re-stamps it on first hit.
      const current = await db.careerSite.findUnique({
        where: { workspaceId: workspace.id },
        select: { customDomain: true },
      });
      if (current?.customDomain !== domain) data.verifiedAt = null;
    }
  }

  await db.careerSite.upsert({
    where: { workspaceId: workspace.id },
    create: { workspaceId: workspace.id, ...data },
    update: data,
  });
  return NextResponse.json({ ok: true });
}
