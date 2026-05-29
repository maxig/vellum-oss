// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

// Seed script — creates the initial admin user and a demo workspace.
// Idempotent: safe to re-run.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";

const db = new PrismaClient();

function workspaceId(slug: string, salt: string) {
  return `ws_${slug}_${createHash("sha256").update(slug + salt).digest("hex").slice(0, 7)}`;
}

// Whether to seed the "goscore" demo workspace and its sample jobs /
// candidates / threads. Defaults to true so the local dev quick-start in the
// README still gets a populated app. The production setup wizard writes
// SEED_DEMO=false so a fresh server starts empty — just the admin login, then
// the operator creates their real workspace through /onboarding.
function shouldSeedDemo() {
  const v = (process.env.SEED_DEMO ?? "true").trim().toLowerCase();
  return !(v === "false" || v === "0" || v === "no" || v === "off" || v === "");
}

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL || "admin@vellum.local").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "vellum";
  const name = process.env.SEED_ADMIN_NAME || "Maya Berg";
  const appOrigin = process.env.APP_ORIGIN || process.env.NEXTAUTH_URL || "http://localhost:3000";
  const publicDomain = process.env.PUBLIC_DOMAIN || "localhost:3000";
  const seedDemo = shouldSeedDemo();

  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    user = await db.user.create({
      data: {
        email,
        name,
        password: await bcrypt.hash(password, 10),
      },
    });
    console.log(`[seed] Created admin user: ${email} / ${password}`);
  } else {
    console.log(`[seed] Admin user ${email} already exists — skipping.`);
  }

  if (!seedDemo) {
    console.log("[seed] SEED_DEMO is off — skipping demo workspace + sample data.");
    console.log("");
    console.log("  ──────────────────────────────────────────────");
    console.log("   Vellum is ready.");
    console.log(`   Admin: ${email}  password: ${password}`);
    console.log(`   App:    ${appOrigin}`);
    console.log("   Sign in, then create your first workspace.");
    console.log("  ──────────────────────────────────────────────");
    return;
  }

  // Workspace
  const slug = "goscore";
  let ws = await db.workspace.findUnique({ where: { slug } });
  if (!ws) {
    const id = workspaceId(slug, "vellum-seed-v1");
    ws = await db.workspace.create({
      data: {
        id,
        slug,
        name: "goscore",
        domain: "goscore.io",
        color: "conic",
        industry: "Fintech",
        size: "11–50",
        memberships: { create: { userId: user.id, role: "owner" } },
        stages: {
          create: [
            { key: "applied",   name: "Applied",      color: "oklch(70% 0.06 250)", position: 0 },
            { key: "screen",    name: "Phone screen", color: "oklch(70% 0.13 220)", position: 1 },
            { key: "interview", name: "Interview",    color: "oklch(72% 0.14 280)", position: 2 },
            { key: "offer",     name: "Offer",        color: "oklch(72% 0.15 80)",  position: 3 },
            { key: "hired",     name: "Hired",        color: "oklch(68% 0.16 150)", position: 4 },
            { key: "rejected",  name: "Rejected",     color: "oklch(70% 0.16 28)",  position: 5 },
          ],
        },
        careerSite: { create: {} },
        aiConfig: { create: { features: { summary: true, draft: true, jd: true, screen: true, rejection: false } } },
      },
    });
    console.log(`[seed] Created workspace goscore`);
  } else {
    // Ensure user is a member
    const m = await db.membership.findUnique({ where: { userId_workspaceId: { userId: user.id, workspaceId: ws.id } } });
    if (!m) {
      await db.membership.create({ data: { userId: user.id, workspaceId: ws.id, role: "owner" } });
    }
    console.log(`[seed] Workspace goscore exists — ensured admin membership.`);
  }

  // Demo data
  const existingCandidates = await db.candidate.count({ where: { workspaceId: ws.id } });
  if (existingCandidates === 0) {
    const { seedDemoData } = await import("../src/lib/seed-demo");
    await seedDemoData(ws.id, user.id, "goscore");
    console.log(`[seed] Seeded demo jobs, candidates, threads.`);
  }

  console.log("");
  console.log("  ──────────────────────────────────────────────");
  console.log("   Vellum is ready.");
  console.log(`   Admin: ${email}  password: ${password}`);
  console.log(`   App:    ${appOrigin}`);
  console.log(`   Career site: http://goscore.${publicDomain}`);
  console.log("  ──────────────────────────────────────────────");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
