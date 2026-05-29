// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 MG Tech AS

import { db } from "@/lib/db";

/**
 * Seed a workspace with the demo "goscore" dataset from the design prototype.
 * Safe to call multiple times — relies on counts to detect prior seeding.
 */
export async function seedDemoData(workspaceId: string, ownerId: string, brandName: string) {
  const existing = await db.candidate.count({ where: { workspaceId } });
  if (existing > 0) return;

  // Stages should already exist from create flow
  const stages = await db.stage.findMany({ where: { workspaceId } });
  const sByKey = Object.fromEntries(stages.map((s) => [s.key, s]));

  // Career site update for goscore copy
  await db.careerSite.upsert({
    where: { workspaceId },
    update: {
      hero: {
        eyebrow: "We're hiring across {n} roles",
        headline_1: "Help us make lending",
        headline_2: "feel obvious.",
        lede: `${brandName} is a small, kind team working with banks across Europe to make credit decisions faster, fairer, and easier to understand.`,
        cta_primary: "See open roles",
        cta_secondary: "Meet the team",
      },
      about: {
        eyebrow: `About ${brandName}`,
        headline: "We build the decisioning layer underneath modern banks.",
        body_1: "We power the credit decisions behind some of Europe's most innovative banks — about 140,000 lending offers a day, all tailored to the person on the other end of the screen.",
        body_2: "The team is 38 people in Berlin, Lisbon and a handful of corners of the EU. We're profitable, well-funded, and not in a rush. We care about craft.",
        stats: [{ n: "38", l: "people" }, { n: "11", l: "countries" }, { n: "140k+", l: "offers/day" }, { n: "$24M", l: "Series A" }],
      },
      values: [
        { t: "Explainable by default", b: "Every decision our software makes can be understood. We hold ourselves to the same standard." },
        { t: "Small team, big trust", b: "We hire slowly and give people room. You'll own things end-to-end." },
        { t: "Kind in feedback", b: "Direct, specific, and on the work — never the person. We protect this." },
        { t: "Built in public-ish", b: "We share our roadmap with customers and our craft with peers. Pull requests welcome." },
      ],
      cta: {
        headline: "Don't see your role?",
        body: "Tell us what you'd want to work on. We read everything that comes in.",
        button_1: "Send us a note",
        button_2: "Read our handbook",
      },
    },
    create: {
      workspaceId,
      brand: { name: brandName, domain: `careers.${brandName}.io` },
      hero: {
        eyebrow: "We're hiring across {n} roles",
        headline_1: "Help us make lending",
        headline_2: "feel obvious.",
        lede: `${brandName} is a small, kind team working with banks across Europe.`,
        cta_primary: "See open roles",
        cta_secondary: "Meet the team",
      },
      about: { eyebrow: "About", headline: "We build excellent software.", body_1: "", body_2: "", stats: [] },
      values: [],
      cta: { headline: "Don't see your role?", body: "We read everything.", button_1: "Send us a note", button_2: "" },
      footer: { email: `careers@${brandName}.io`, company: `© ${brandName}` },
    },
  });

  // ─── Jobs ───────────────────────────────────────────────────────────
  const jobsData = [
    {
      slug: "senior-product-designer",
      title: "Senior Product Designer",
      department: "Design",
      location: "Berlin · Hybrid",
      employment: "Full-time",
      status: "Open" as const,
      pitch: "Help us design the credit decisioning console used every day by risk teams at the banks we work with.",
      description: `${brandName} helps banks make better lending decisions and bring tailor-made offers to consumers. As a Senior Product Designer on our small but mighty design team, you'll own the end-to-end experience of the credit decisioning console — the tool risk teams at our partner banks use every day to set policy, model outcomes, and ship offers to customers.\n\nYou'll work closely with our risk modellers, engineers, and partner banks to design interfaces that make complicated lending logic feel obvious. We care a lot about explainability: every screen should help our users understand why a decision was made.\n\nThis is a generalist IC role with a strong systems flavor. You'll set patterns, ship features, and shape how we think about design at ${brandName}.`,
      requirements: [
        "5+ years designing complex B2B / fintech / data products",
        "A portfolio with at least one truly data-dense interface you're proud of",
        "Comfortable with ambiguity, opinionated about systems, kind in feedback",
        "EU timezone, available to be in our Berlin office one day a week",
      ],
      niceToHave: ["Background in financial services or risk", "Has shipped an internal tool from zero to one", "Comfortable pairing with engineers", "Cares about typography"],
      processSteps: [
        { n: "Intro chat", who: "30 min with Maya, our recruiter", d: "" },
        { n: "Portfolio review", who: "45 min with the design team", d: "Walk us through 2–3 projects you're proud of" },
        { n: "Take-home craft", who: "~3 hrs on your own time", d: "A small, paid design exercise on a real-ish problem" },
        { n: "On-site / virtual on-site", who: "Half a day, 3 sessions", d: "Meet engineering, product, and the team you'd join" },
        { n: "Offer", who: "Within a week of on-site", d: "" },
      ],
      hiringTeam: [{ name: "Esme", role: "Design lead" }, { name: "Jules", role: "Hiring manager" }, { name: "Ana", role: "Design" }],
      salaryMin: 95000, salaryMax: 115000, channels: { vellum: true, linkedin: true },
    },
    {
      slug: "staff-backend-engineer",
      title: "Staff Backend Engineer (Rails)",
      department: "Engineering",
      location: "Remote (EU)",
      employment: "Full-time",
      status: "Open" as const,
      pitch: "Build the Rails monolith that quietly handles 140k lending decisions a day.",
      description: `We're looking for a Staff-level backend engineer to take ownership of the Rails monolith that powers ${brandName}'s decisioning engine. You'll work alongside our CTO and a small platform team on the boring-but-critical work that lets the rest of the company move fast.`,
      requirements: [
        "8+ years of professional backend experience, including 4+ with Rails at scale",
        "Deep comfort with Postgres — query plans, indexes, the lot",
        "Experience running things in production: oncall, incident response, observability",
        "Pragmatic about tooling. We don't rewrite for the sake of rewriting.",
      ],
      niceToHave: ["Experience in fintech or other regulated industries", "Background in distributed systems", "Open-source contributions"],
      processSteps: [
        { n: "Intro chat", who: "30 min with Maya", d: "" },
        { n: "Technical deep-dive", who: "60 min with our CTO", d: "" },
        { n: "Pairing session", who: "90 min with a senior engineer", d: "On our actual codebase" },
        { n: "Team meet", who: "60 min", d: "" },
      ],
      hiringTeam: [{ name: "Adeel", role: "CTO" }, { name: "Lina", role: "Sr. Engineer" }],
      salaryMin: 135000, salaryMax: 165000, channels: { vellum: true },
    },
    {
      slug: "risk-modeller",
      title: "Risk Modeller",
      department: "Data Science",
      location: "Berlin · On-site",
      employment: "Full-time",
      status: "Open" as const,
      pitch: "Build the credit models that power our decisioning engine end-to-end.",
      description: "You'll own credit risk models from feature engineering through deployment, working closely with our partner banks and our engineers to ship models to production.",
      requirements: ["PhD or MSc in a quantitative field", "5+ years building credit risk or fraud models", "Python + SQL fluency"],
      niceToHave: ["Consumer credit", "PSD2 / GDPR familiarity"],
      processSteps: [{ n: "Intro chat", who: "30 min", d: "" }, { n: "Technical interview", who: "60 min", d: "" }, { n: "Take-home", who: "Real data, ~4 hrs", d: "" }],
      hiringTeam: [{ name: "Linnea", role: "Head of Risk" }],
      salaryMin: 100000, salaryMax: 130000, channels: { vellum: true },
    },
    {
      slug: "partnerships-lead",
      title: "Partnerships Lead",
      department: "Go-to-market",
      location: "London · Hybrid",
      employment: "Full-time",
      status: "Open" as const,
      pitch: "Own our partnerships with new banks across the UK and Ireland.",
      description: "This is a builder role. You'll be our first dedicated partnerships hire in the UK — sourcing, qualifying, and closing partnership deals with mid-market banks.",
      requirements: ["7+ years in BD or enterprise sales", "Existing network among UK risk and product leaders"],
      niceToHave: [],
      processSteps: [{ n: "Intro chat", who: "30 min", d: "" }, { n: "Working session", who: "60 min", d: "" }],
      hiringTeam: [{ name: "Eli", role: "VP Partnerships" }],
      salaryMin: 95000, salaryMax: 95000, salaryCurrency: "GBP", channels: { vellum: true },
    },
    {
      slug: "founding-account-executive",
      title: "Founding Account Executive",
      department: "Sales",
      location: "Remote (EU)",
      employment: "Full-time",
      status: "Draft" as const,
      pitch: "First AE hire — build the playbook with the founders.",
      description: "We've been growing through founder-led sales. You'd be the first full-time AE.",
      requirements: ["4+ years closing complex B2B deals", "Loves greenfield"],
      niceToHave: [],
      processSteps: [],
      hiringTeam: [{ name: "Adeel", role: "CTO" }],
      salaryMin: 85000, salaryMax: 85000, channels: {},
    },
  ];

  const createdJobs: Record<string, string> = {};
  for (const j of jobsData) {
    const { slug, salaryCurrency, status, ...rest } = j as any;
    const job = await db.job.create({
      data: {
        workspaceId,
        slug,
        status,
        publishedAt: status === "Open" ? new Date(Date.now() - Math.floor(Math.random() * 20) * 86400_000) : null,
        salaryCurrency: salaryCurrency || "EUR",
        ...rest,
      },
    });
    createdJobs[slug] = job.id;
  }

  // ─── Candidates + applications (all for Senior Product Designer) ─────
  const c = [
    { name: "Amelia Chen",  location: "Berlin, DE",  email: "amelia.chen@hey.com",       skills: ["Design Systems", "B2B"],         stage: "applied",   ai: 92, source: "Career site", daysAgo: 2,  role: "Sr. Designer @ N26" },
    { name: "Marcus Rivera",location: "Lisbon, PT",  email: "marcus@riveradesign.co",    skills: ["Mobile", "Motion"],              stage: "applied",   ai: 81, source: "LinkedIn",     daysAgo: 3,  role: "Product Designer @ Revolut" },
    { name: "Yuki Tanaka",  location: "Remote (CET)",email: "yuki.t@protonmail.com",     skills: ["Visual", "Branding"],            stage: "applied",   ai: 76, source: "Referral",     daysAgo: 4,  role: "Senior Designer" },
    { name: "Priya Iyer",   location: "London, UK",  email: "priya.iyer@gmail.com",      skills: ["Research", "Design Systems"],    stage: "screen",    ai: 88, source: "Career site",  daysAgo: 6,  role: "Lead Designer @ Wise" },
    { name: "Theo Larsen",  location: "Copenhagen",  email: "theo@larsen.dk",            skills: ["B2B", "Mobile"],                 stage: "screen",    ai: 79, source: "LinkedIn",     daysAgo: 8,  role: "Sr. Designer" },
    { name: "Sofia Moreau", location: "Paris, FR",   email: "sofia@moreau.fr",           skills: ["Design Systems"],                stage: "interview", ai: 91, source: "Referral",     daysAgo: 11, role: "Sr. Designer @ Qonto" },
    { name: "Daniel Okafor",location: "Berlin, DE",  email: "daniel.okafor@gmail.com",   skills: ["Visual", "Motion"],              stage: "interview", ai: 85, source: "Career site",  daysAgo: 13, role: "Designer @ Trade Republic" },
    { name: "Hana Park",    location: "Amsterdam",   email: "hana@parkdesign.nl",        skills: ["B2B"],                            stage: "offer",     ai: 93, source: "Career site",  daysAgo: 21, role: "Sr. Designer @ Bunq" },
    { name: "Idris Khan",   location: "Berlin, DE",  email: "idris@khan.io",             skills: ["Mobile"],                         stage: "hired",     ai: 89, source: "Referral",     daysAgo: 32, role: "Designer" },
    { name: "Nina Volkov",  location: "Tallinn, EE", email: "nina@volkov.ee",            skills: ["Design Systems", "Research"],     stage: "applied",   ai: 84, source: "Career site",  daysAgo: 1,  role: "Designer @ Wise" },
    { name: "Liam O'Sullivan", location: "Dublin",   email: "liam@osullivan.ie",         skills: ["Visual"],                         stage: "screen",    ai: 72, source: "Career site",  daysAgo: 5,  role: "Senior Designer" },
    { name: "Esther Kone",  location: "Remote",      email: "esther.kone@hey.com",       skills: ["B2B", "Motion"],                  stage: "interview", ai: 87, source: "LinkedIn",     daysAgo: 10, role: "Designer @ ClimateOS" },
  ];

  const jobId = createdJobs["senior-product-designer"];
  const candidateIds: Record<string, string> = {};
  for (const cand of c) {
    const cr = await db.candidate.create({
      data: {
        workspaceId,
        name: cand.name,
        email: cand.email,
        location: cand.location,
        currentRole: cand.role,
        source: cand.source,
        skills: cand.skills,
      },
    });
    candidateIds[cand.name] = cr.id;
    await db.application.create({
      data: {
        workspaceId,
        candidateId: cr.id,
        jobId,
        stageId: sByKey[cand.stage]?.id,
        aiFit: cand.ai,
        appliedAt: new Date(Date.now() - cand.daysAgo * 86400_000),
      },
    });
  }

  // ─── Threads & messages ──────────────────────────────────────────────
  const threads = [
    {
      name: "Amelia Chen", subject: "Senior Product Designer application",
      unread: true, starred: true,
      msgs: [
        { dir: "in", body: "Hi goscore team — I've spent the last few years working on trading and lending dashboards at N26, and the thing I'm most proud of is making complicated risk data feel obvious to the people using it. Your homepage line about \"explainable decisions\" is exactly the work I want to do next. I'd love to talk.", daysAgo: 3 },
        { dir: "out", body: "Hi Amelia — thanks so much for the thoughtful note. Your N26 work jumped out for exactly the reasons you mentioned. Would you have 30 minutes this week for a first chat?", daysAgo: 2 },
        { dir: "in", body: "Thanks for the quick reply! Looking forward to hearing more. I'm available most of next week if that helps — Tuesday/Wednesday/Thursday all work.", daysAgo: 2 },
        { dir: "out", body: "Perfect. Let's lock in Thursday at 14:00 CET. I'll send a calendar invite shortly with the details and a few links to read beforehand.", daysAgo: 0 },
      ],
    },
    {
      name: "Priya Iyer", subject: "Re: Sr. Product Designer — next steps",
      unread: false, starred: false,
      msgs: [
        { dir: "out", body: "Hi Priya — great chatting today. The team really enjoyed the conversation. We'd love to move forward with a portfolio review next week. Does Tuesday work?", daysAgo: 1 },
        { dir: "in", body: "Tuesday is great. Thanks Maya!", daysAgo: 1 },
      ],
    },
    {
      name: "Sofia Moreau", subject: "Re: On-site interview",
      unread: false, starred: false,
      msgs: [
        { dir: "in", body: "Quick question — should I prepare anything specific for the systems thinking session?", daysAgo: 2 },
        { dir: "out", body: "Great question — nope, no prep needed. We'll work through a real-ish exercise together. Bring questions.", daysAgo: 1 },
      ],
    },
    {
      name: "Hana Park", subject: "Offer — Senior Product Designer",
      unread: true, starred: true,
      msgs: [
        { dir: "out", body: "Hi Hana — attached is the formal offer for Senior Product Designer. Let me know if you have any questions. We're really hoping you say yes!", daysAgo: 2 },
        { dir: "in", body: "Thank you so much. Reviewing now — will get back to you tomorrow with any questions.", daysAgo: 1 },
      ],
    },
  ];

  for (const t of threads) {
    const cid = candidateIds[t.name];
    if (!cid) continue;
    const thread = await db.thread.create({
      data: {
        workspaceId,
        candidateId: cid,
        jobId,
        subject: t.subject,
        unread: t.unread,
        starred: t.starred,
        lastAt: new Date(Date.now() - t.msgs[t.msgs.length - 1].daysAgo * 86400_000),
      },
    });
    for (const m of t.msgs) {
      await db.message.create({
        data: {
          threadId: thread.id,
          direction: m.dir,
          body: m.body,
          fromUserId: m.dir === "out" ? ownerId : null,
          fromName: m.dir === "in" ? t.name : null,
          createdAt: new Date(Date.now() - m.daysAgo * 86400_000),
        },
      });
    }
  }

  // ─── Notes ───────────────────────────────────────────────────────────
  for (const [name, body] of [
    ["Amelia Chen", "Strong portfolio. Worked on fintech dashboards at N26."],
    ["Sofia Moreau", "Loved the second round. Strong systems thinker."],
    ["Hana Park", "Verbal yes. Drafting offer for Friday."],
  ] as const) {
    if (candidateIds[name]) {
      await db.note.create({
        data: { workspaceId, candidateId: candidateIds[name], authorId: ownerId, body },
      });
    }
  }

  // ─── Interviews ──────────────────────────────────────────────────────
  const interviewApps = await db.application.findMany({
    where: { workspaceId, stage: { key: "interview" } },
    take: 3,
  });
  for (let i = 0; i < interviewApps.length; i++) {
    const day = new Date();
    day.setDate(day.getDate() + i + 1);
    day.setHours(14 + i, 0, 0, 0);
    // Interviewers are now a relation via InterviewParticipant. The
    // demo seed doesn't try to populate them — the workspace owner can
    // schedule real interviews from the candidate profile sheet, which
    // is where the user picker lives. This row exists mostly so the
    // Pipeline view shows "interview scheduled" history.
    await db.interview.create({
      data: {
        workspaceId,
        applicationId: interviewApps[i].id,
        kind: "video",
        scheduledAt: day,
        durationMin: 45,
        agenda: "Portfolio walkthrough, systems thinking exercise.",
      },
    });
  }

  // ─── Activity ────────────────────────────────────────────────────────
  const recent = [
    { actor: "Sofia Moreau", kind: "moved",     icon: "Pipeline", body: "moved to Interview" },
    { actor: "Vellum",       kind: "ai",        icon: "Sparkle",  body: "Summarised 6 new applications" },
    { actor: "Career site",  kind: "applied",   icon: "Globe",    body: "Received 12 new applications across 4 roles" },
    { actor: "Hana Park",    kind: "moved",     icon: "Heart",    body: "Verbally accepted offer · €112k" },
  ];
  for (let i = 0; i < recent.length; i++) {
    await db.activity.create({
      data: {
        workspaceId,
        actorName: recent[i].actor,
        kind: recent[i].kind,
        icon: recent[i].icon,
        body: recent[i].body,
        createdAt: new Date(Date.now() - (i + 1) * 60 * 60 * 1000),
      },
    });
  }

  // ─── Career site analytics seed ──────────────────────────────────────
  // Populate ~60 days of public-site events so the /analytics page has
  // realistic numbers immediately after seeding (otherwise it's all zeros
  // until a real visitor lands). Mirrors the curve in the design prototype:
  // mild upward trend, weekend dampening, ~62% mobile share, and a Hacker
  // News spike around the middle of the window.
  await seedCareerEvents(workspaceId);
}

async function seedCareerEvents(workspaceId: string) {
  const jobs = await db.job.findMany({
    where: { workspaceId, status: "Open" },
    select: { id: true, slug: true, title: true },
  });
  if (jobs.length === 0) return;

  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { slug: true } });
  const wsSlug = workspace?.slug || "ws";

  // Deterministic PRNG so reruns produce the same shape — no flapping
  // analytics dashboards between demo restarts.
  let seed = 42;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const days = 60;
  const sources: { ref: string | null; weight: number }[] = [
    { ref: null, weight: 0.31 }, // direct
    { ref: "https://www.linkedin.com/jobs/", weight: 0.23 },
    { ref: "https://www.google.com/search?q=jobs", weight: 0.17 },
    { ref: "https://twitter.com/", weight: 0.09 },
    { ref: "https://news.ycombinator.com/", weight: 0.06 },
    { ref: "https://github.com/", weight: 0.06 },
    { ref: "https://www.reddit.com/", weight: 0.08 },
  ];
  const pickSource = () => {
    const r = rnd();
    let acc = 0;
    for (const s of sources) {
      acc += s.weight;
      if (r < acc) return s.ref;
    }
    return null;
  };

  const countries: { code: string; weight: number }[] = [
    { code: "DE", weight: 0.27 }, { code: "GB", weight: 0.16 },
    { code: "FR", weight: 0.10 }, { code: "NL", weight: 0.08 },
    { code: "PT", weight: 0.06 }, { code: "ES", weight: 0.05 },
    { code: "PL", weight: 0.04 }, { code: "US", weight: 0.08 },
    { code: "IT", weight: 0.04 }, { code: "IE", weight: 0.03 },
    { code: "AT", weight: 0.03 }, { code: "BE", weight: 0.02 },
    { code: "DK", weight: 0.02 }, { code: "SE", weight: 0.02 },
  ];
  const pickCountry = () => {
    const r = rnd();
    let acc = 0;
    for (const c of countries) {
      acc += c.weight;
      if (r < acc) return c.code;
    }
    return "Other";
  };

  // Mobile share rises over the period (27% → 32%), matching the design
  // prompt's "mobile share is up" insight.
  const pickDevice = (dayIdx: number): "desktop" | "mobile" | "tablet" => {
    const mobileShare = 0.27 + (dayIdx / days) * 0.05;
    const r = rnd();
    if (r < mobileShare) return "mobile";
    if (r < mobileShare + 0.06) return "tablet";
    return "desktop";
  };

  // Per-job baseline weight so the top-jobs table has variance.
  const jobWeights = jobs.map((_, i) => 1 / Math.pow(i + 1, 0.6));
  const jobWeightTotal = jobWeights.reduce((s, w) => s + w, 0);
  const pickJobIdx = () => {
    const r = rnd() * jobWeightTotal;
    let acc = 0;
    for (let i = 0; i < jobWeights.length; i++) {
      acc += jobWeights[i];
      if (r < acc) return i;
    }
    return jobWeights.length - 1;
  };

  const events: {
    workspaceId: string;
    kind: string;
    jobId: string | null;
    sessionId: string;
    country: string | null;
    referrer: string | null;
    path: string;
    device: string;
    createdAt: Date;
  }[] = [];

  let sessionCounter = 0;
  const newSession = () => `s_seed_${(sessionCounter++).toString(16).padStart(6, "0")}`;

  for (let dayBack = days - 1; dayBack >= 0; dayBack--) {
    const date = new Date();
    date.setUTCHours(12, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - dayBack);
    const dayIdx = days - 1 - dayBack;

    const weekday = date.getUTCDay(); // 0 = Sun
    const dampen = weekday === 0 || weekday === 6 ? 0.55 : 1;
    const trend = 1 + dayIdx * 0.012;
    // Hacker News spike — single-day boost ~14 days ago, replicates the
    // "post on May 14" insight from the design prompt.
    const spike = dayBack === 14 ? 2.3 : 1;
    const visitsToday = Math.round((140 + rnd() * 90) * dampen * trend * spike);

    for (let v = 0; v < visitsToday; v++) {
      const session = newSession();
      const country = pickCountry();
      // On the spike day, weight HN much higher.
      const referrer = dayBack === 14 && rnd() < 0.55 ? "https://news.ycombinator.com/" : pickSource();
      const country2 = country === "Other" ? null : country;
      const device = pickDevice(dayIdx);
      // Some sessions land on root, some go straight to a job page from search.
      const rootFirst = rnd() < 0.55;
      const jobIdx = pickJobIdx();
      const job = jobs[jobIdx];

      const ts = new Date(date.getTime() + Math.floor(rnd() * 12 * 3600 * 1000));

      if (rootFirst) {
        events.push({
          workspaceId,
          kind: "page_view",
          jobId: null,
          sessionId: session,
          country: country2,
          referrer,
          path: `/careers/${wsSlug}`,
          device,
          createdAt: ts,
        });
      }
      events.push({
        workspaceId,
        kind: "page_view",
        jobId: job.id,
        sessionId: session,
        country: country2,
        referrer,
        path: `/careers/${wsSlug}/jobs/${job.slug}`,
        device,
        createdAt: new Date(ts.getTime() + 60_000),
      });

      // 7% of sessions click apply, of those 78% complete.
      if (rnd() < 0.072) {
        events.push({
          workspaceId,
          kind: "form_start",
          jobId: job.id,
          sessionId: session,
          country: country2,
          referrer,
          path: `/careers/${wsSlug}/jobs/${job.slug}/apply`,
          device,
          createdAt: new Date(ts.getTime() + 180_000),
        });
        if (rnd() < 0.78) {
          events.push({
            workspaceId,
            kind: "apply_complete",
            jobId: job.id,
            sessionId: session,
            country: country2,
            referrer,
            path: `/careers/${wsSlug}/jobs/${job.slug}/apply`,
            device,
            createdAt: new Date(ts.getTime() + 360_000),
          });
        }
      }
    }
  }

  // createMany is significantly faster than a per-row insert here — we're
  // about to write ~9k rows on a typical demo seed.
  await db.careerSiteEvent.createMany({ data: events });
}
