// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaceId, slugify } from "@/lib/utils";
import { DEFAULT_STAGES } from "@/lib/design";
import { seedDemoData } from "@/lib/seed-demo";

const Body = z.object({
  name: z.string().min(1).max(60),
  slug: z.string().min(1).max(40).optional(),
  domain: z.string().optional().nullable(),
  color: z.string().default("conic"),
  industry: z.string().optional().nullable(),
  size: z.string().optional().nullable(),
  seed: z.boolean().default(false),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const d = parsed.data;
  let slug = d.slug ? slugify(d.slug) : slugify(d.name);

  // Ensure slug uniqueness
  let n = 0;
  while (await db.workspace.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${slugify(d.slug || d.name)}-${n}`;
  }

  const id = workspaceId(slug);
  const ws = await db.workspace.create({
    data: {
      id,
      slug,
      name: d.name,
      domain: d.domain || `${slug}.com`,
      color: d.color,
      industry: d.industry,
      size: d.size,
      memberships: { create: { userId: session.user.id, role: "owner" } },
      stages: { create: DEFAULT_STAGES.map((s, i) => ({ key: s.key, name: s.name, color: s.color, position: i })) },
      careerSite: {
        create: {
          brand: { name: d.name, domain: `careers.${d.domain || slug}` },
          hero: {
            eyebrow: "We're hiring across {n} roles",
            headline_1: `Build with ${d.name}.`,
            headline_2: "We're listening.",
            lede: "We're a small team that cares about craft. Here are the roles we're hiring for right now.",
            cta_primary: "See open roles",
            cta_secondary: "Meet the team",
          },
          about: {
            eyebrow: "About",
            headline: `${d.name} builds excellent software.`,
            body_1: "We're hiring people who care about the craft as much as the outcome.",
            body_2: "Direct in feedback, generous with trust. Here's what we're working on.",
            stats: [{ n: "—", l: "people" }, { n: "—", l: "founded" }, { n: "—", l: "customers" }, { n: "—", l: "raised" }],
          },
          values: [],
          cta: { headline: "Don't see your role?", body: "Tell us what you'd want to work on.", button_1: "Send us a note", button_2: "" },
          footer: { email: `careers@${d.domain || `${slug}.com`}`, company: `© ${d.name}` },
        },
      },
      aiConfig: { create: { features: { summary: true, draft: true, jd: true, screen: true, rejection: false } } },
    },
  });

  if (d.seed) {
    await seedDemoData(ws.id, session.user.id, d.name);
  }

  const c = await cookies();
  c.set("vellum_ws", ws.id, { httpOnly: false, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
  await db.userPreference.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, lastWorkspace: ws.id },
    update: { lastWorkspace: ws.id },
  });

  return NextResponse.json({ id: ws.id, slug: ws.slug });
}
