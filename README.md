<div align="center">

# Vellum

**An open-source, AI-first applicant tracking system (ATS) you can self-host in minutes.**

Beautiful hiring pipeline · branded career sites · a calm shared inbox ·
bring-your-own (or local) AI. Multi-tenant, privacy-respecting, and yours to run.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-2b6cb0.svg)](LICENSE)
![Self-hosted](https://img.shields.io/badge/self--hosted-Docker-2496ed.svg)
![Status: MVP](https://img.shields.io/badge/status-active%20MVP-f59e0b.svg)
![PRs welcome](https://img.shields.io/badge/PRs-welcome-22c55e.svg)

</div>

---

## Contents

- [Why Vellum](#why-vellum)
- [Features](#features)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Updating](#updating)
- [FAQ](#faq)
- [Tech stack](#tech-stack)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## Why Vellum

Most ATSs are either expensive SaaS that owns your candidate data, or clunky
self-hosted tools that feel like a database with a form bolted on. Vellum is
built to be **delightful to use, honest about AI, and fully self-hosted** — your
data stays on your infrastructure, AI is optional and bring-your-own, and the
whole thing runs from a single `docker compose`.

> **Status:** actively developed MVP. The full hiring loop works today:
> career site → application → pipeline → inbox → interview. AI features return
> high-quality mock responses until you add a provider key, so the UI is fully
> alive out of the box.

<!-- Screenshots welcome — drop them in docs/ and link here. -->

---

## Features

### Pipeline & workflow
- **Kanban pipeline** with drag-and-drop, customizable stages per workspace.
- **Applicant ProfileSheet** — overview, résumé preview (PDF/image), communication, and timeline in one sheet.
- Stage moves, internal team notes, and activity history.

### Candidates
- Searchable **candidate database** scoped to each workspace.
- **AI résumé parsing** to backfill role, experience, location, and links on applicants from your career site.
- **AI candidate summaries** anchored to the résumé + role (never auto-decisions).

### Jobs
- Job lifecycle management with **AI-assisted job-description drafting & rewriting**.
- One click to publish a role to your branded career site.

### Career sites
- **Server-rendered, SEO-friendly career sites**, one per workspace.
- Per-workspace **subdomains** (`careers.yourco.com` / `yourco.example.com`) with custom-domain support.
- No-code **WYSIWYG editor** for lede, about, team stories, offices, values, and CTAs.
- Built-in, configurable **cookie-consent** banner for GDPR-friendly tracking.

### Unified inbox & email
- Per-workspace **IMAP + SMTP** — connect your real shared inbox (e.g. `careers@yourco.com`).
- Threaded conversations with proper `In-Reply-To`/`References` headers.
- **AI reply drafts** that match tone and never auto-send.
- Inbound/outbound credentials **AES-256-GCM encrypted at rest**.

### Calendar & scheduling
- Schedule interviews with **Google Calendar, Microsoft 365/Outlook, and CalDAV** (iCloud, Fastmail, Nextcloud…).
- `.ics` invites and follow-up handling; CalDAV needs no server-side OAuth setup.

### AI — optional, bring-your-own, or fully local
- Multi-provider: **Anthropic, OpenAI, and Ollama / [Ollama Cloud](https://ollama.com)** (Google planned).
- **No key? No problem.** Every AI surface falls back to polished mock output, so nothing looks broken.
- Per-workspace provider/model/key overrides in **Settings → AI**, with token-usage tracking.
- AI assists — it **never auto-rejects** candidates (EU AI Act-aware) and labels AI-generated content.

### Analytics & insights
- Pipeline **analytics dashboard**, a candidate **review queue**, and a **monthly recap**.

### Multi-tenant & roles
- **Workspaces** with hard per-tenant data isolation (`workspaceId` on every record).
- Roles: **owner / admin / member**, plus hiring-team and interviewer relationships.
- Invite teammates by email with token-based, role-scoped links.

### Design & self-hosting
- "Liquid Glass" UI — **dark/light themes**, compact/cozy **density modes**, OKLCH theming.
- **One-command install**, automatic **HTTPS** (Caddy, incl. wildcard career-site certs), optional **auto-updates** (Watchtower).
- Runs on **Docker + PostgreSQL**. Your data lives in named volumes you control.

---

## Quick start

### Option A — turnkey (fresh server, zero Docker knowledge)

Installs Docker, downloads what's needed, and runs the guided setup:

```bash
curl -fsSL https://raw.githubusercontent.com/maxig/vellum-oss/main/setup-all.sh | sudo bash
```

### Option B — guided install (you already have Docker)

```bash
git clone https://github.com/maxig/vellum-oss.git vellum
cd vellum
./setup.sh
```

`setup.sh` is an interactive wizard (press **Enter** to accept defaults). It checks
Docker, generates strong secrets, optionally configures HTTPS and AI, and starts a
**clean** instance — no demo data. You sign in with the admin account you chose and
create your first workspace.

### Option C — local trial (see it with sample data)

```bash
git clone https://github.com/maxig/vellum-oss.git vellum
cd vellum
cp .env.example .env
docker compose up --build
```

Open <http://localhost:3000>. The first run seeds a demo "goscore" workspace and
prints the login (`admin@vellum.local` / `vellum`). Career site:
<http://goscore.localhost:3000>.

### Requirements

- **Docker Engine + Compose** (the turnkey script installs these for you).
- For public HTTPS: a **domain** with DNS pointing at your server
  (`A` record for the app host, and a `*.` wildcard for career-site subdomains).

---

## Configuration

All configuration lives in `.env` — `setup.sh` writes it for you, or copy
[`.env.example`](.env.example) and edit by hand. Highlights:

| Area | Keys | Notes |
|---|---|---|
| Secrets | `NEXTAUTH_SECRET`, `VELLUM_SECRET` | Auto-generated by `setup.sh`. `VELLUM_SECRET` encrypts stored email/calendar credentials. |
| URLs | `APP_ORIGIN`, `NEXTAUTH_URL`, `PUBLIC_DOMAIN` | App URL + the apex career-site subdomains hang off. |
| AI | `AI_PROVIDER`, `OLLAMA_*`, `ANTHROPIC_*`, `OPENAI_*` | Optional. Overridable per workspace in Settings. |
| Database | `POSTGRES_*` | Defaults are fine; `setup.sh` generates a strong password. |
| Calendar | `GOOGLE_*`, `MICROSOFT_*` | OAuth apps; CalDAV needs nothing here. |

**AI recommendation:** the easiest path to real AI is **[Ollama Cloud](https://ollama.com)** —
hosted open models with a free tier. Create a key at
<https://ollama.com/settings/keys>, then set `AI_PROVIDER=ollama`,
`OLLAMA_BASE_URL=https://ollama.com`, and `OLLAMA_API_KEY=…`. You can also do this
later, per workspace, in **Settings → AI**.

**Email** is configured per workspace in **Settings → Email** (no `.env` needed).

---

## Updating

On a server set up with `setup.sh`:

```bash
./update.sh        # pulls the latest image (or rebuilds from source) and restarts
```

Or enable **Watchtower** during setup for automatic updates. Your data
(`vellum_db`, `vellum_uploads` volumes) is preserved and database migrations run
automatically on start.

---

## FAQ

**Is it really free and open source?**
Yes — licensed under [AGPL-3.0](#license). Self-host it, modify it, run it for your
company at no cost. The only obligation: if you offer a *modified* version to others
over a network, you share your changes (see the license note below).

**Do I need an AI API key?**
No. Without a key, AI features return high-quality mock responses so the app is fully
usable. Add a key anytime to switch on real AI.

**Which AI providers are supported?**
Anthropic (Claude), OpenAI, and Ollama / Ollama Cloud today; Google is planned. You
can run **fully locally** with a self-hosted Ollama server, or use Ollama Cloud for a
zero-infrastructure hosted option. Keys/models are configurable per workspace.

**Is candidate data sent to AI providers?**
Only when you enable a provider, and only for the specific feature you trigger
(summaries, drafts, JD rewrites). With no provider configured, nothing leaves your
server. Vellum is designed to assist, not auto-decide — it never auto-rejects.

**How do career sites and custom domains work?**
Each workspace gets a subdomain of `PUBLIC_DOMAIN` (e.g. `acme.yourdomain.com`).
`setup.sh` can provision a wildcard HTTPS certificate so every workspace's career
site is served over TLS. Point a `*.` DNS record at your server and you're set.

**How is data isolated between workspaces?**
Every record carries a `workspaceId` and queries are scoped to the active workspace,
so candidates and jobs never leak across tenants.

**How do I invite teammates?**
**Settings → Team** → enter an email and pick a role (owner/admin/member). Vellum
generates a token-based invite link to share.

**How do I back up my data?**
Everything lives in the `vellum_db` (PostgreSQL) and `vellum_uploads` Docker volumes.
Back those up (e.g. `pg_dump` the database and archive uploads) and you can restore
anywhere.

**Can I run it without Docker?**
Yes, for development — you still need PostgreSQL. See [Contributing](#contributing);
Docker is strongly recommended for production.

**Is it production-ready?**
It's an actively developed MVP: the core hiring loop is solid and self-hostable.
Review the open issues for current rough edges before betting your whole process on it.

---

## Tech stack

- **Next.js (App Router)** — admin app + server-rendered career sites in one binary
- **PostgreSQL + Prisma** — strict multi-tenant data model
- **NextAuth (credentials)** — JWT sessions, bcrypt passwords, token invites
- **@dnd-kit** — accessible drag-and-drop Kanban
- Multi-provider **AI abstraction** (Anthropic / OpenAI / Ollama) with mock fallback
- **IMAP/SMTP** for the inbox; provider OAuth for calendars
- **Plain CSS** design system · **Docker + Caddy** for delivery

---

## Contributing

Contributions are welcome — issues, ideas, docs, testing, and PRs all help. 🙌

**Ways to help**
- 🐛 **Report bugs** or 💡 **request features** via [GitHub Issues](https://github.com/maxig/vellum-oss/issues).
- 📝 Improve docs, examples, or this README.
- 🔧 Fix a bug or build a feature (browse issues labeled `good first issue`).

**Development setup**
```bash
git clone https://github.com/maxig/vellum-oss.git vellum
cd vellum
cp .env.example .env
docker compose up -d db          # Postgres in Docker
npm install
npm run prisma:push && npm run db:seed
npm run dev                      # http://localhost:3000
```

**Guidelines**
- Keep PRs focused; describe the change and how you tested it.
- Match the existing style (TypeScript, plain CSS, small components).
- New source files should carry an SPDX license header:
  ```ts
  // SPDX-License-Identifier: AGPL-3.0-or-later
  ```
- Sign your commits off (Developer Certificate of Origin): `git commit -s`.
- By contributing, you agree your work is licensed under **AGPL-3.0**.

**Workflow:** fork → branch → commit → open a PR against `main`. A maintainer will
review and, once merged, it ships in the next release and image.

Please be kind and constructive — we follow the spirit of the
[Contributor Covenant](https://www.contributor-covenant.org/).

---

## Security

Please **do not** open public issues for security vulnerabilities. Email
`security@<your-domain>` with details and we'll respond promptly. _(Maintainers:
replace this with your real security contact.)_

---

## License

Vellum is licensed under the **GNU Affero General Public License v3.0**
(AGPL-3.0) — see [`LICENSE`](LICENSE).

Copyright © 2026 MG Tech AS.

AGPL keeps Vellum genuinely open source while closing the SaaS loophole: anyone who
runs a *modified* version as a network service must make the corresponding source
available to its users (AGPL §13). Adopt, self-host, and modify freely — you just
can't turn a fork into a closed hosted product without sharing your changes.
