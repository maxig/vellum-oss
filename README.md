# Vellum

An open-source, AI-first Applicant Tracking System.
Self-hosted, "Liquid Glass" aesthetic, multi-tenant workspaces.

> **Status:** MVP. The whole hiring loop works locally: career site → application
> → kanban → inbox → interview. AI features (summaries, reply drafts, JD
> rewrite) run on Anthropic when you give it a key, otherwise they return
> high-quality mocks so the UI still feels alive.

---

## Quick start (Docker, ~2 min)

```bash
git clone <this-repo> vellum
cd vellum
cp .env.example .env       # adjust if you want; defaults are fine for local
docker compose up --build
```

On first run the app container migrates Postgres, seeds a demo "goscore"
workspace, prints the admin credentials, and starts on port 3000:

```
  ──────────────────────────────────────────────
   Vellum is ready.
   Admin: admin@vellum.local   password: vellum
   App:    http://localhost:3000
   Career site: http://goscore.localhost:3000
  ──────────────────────────────────────────────
```

Open <http://localhost:3000> and sign in.

### Career site URLs

Career sites live on a **per-workspace subdomain** of the apex configured in
`PUBLIC_DOMAIN` (default `localhost:3000`). For the seed workspace:

- Public site: <http://goscore.localhost:3000>
- A specific role: <http://goscore.localhost:3000/jobs/senior-product-designer>

On most browsers `*.localhost` resolves to 127.0.0.1 without any `/etc/hosts`
edits. If yours doesn't, add:

```
127.0.0.1 goscore.localhost
```

When you create new workspaces from the in-app UI, use their slug — e.g.
`acme.localhost:3000`.

---

## Production install

For a real server (your own domain + HTTPS), use the guided installer instead
of the local quick-start. It checks Docker, generates strong secrets, sets up
automatic HTTPS, and starts an **empty** instance — no demo data:

```bash
git clone <this-repo> vellum
cd vellum
./setup.sh
```

The wizard walks you through every setting. Press **Enter** to accept the
`[default]` shown for any step, skip the optional ones, and re-run it anytime to
change a single value (it backs up your `.env` and offers current values as
defaults):

- **Docker preflight** — verifies Docker + Compose are installed and the daemon
  is reachable, with copy-paste install commands if not.
- **Deployment mode** — pull a prebuilt image (recommended) or build from source.
- **Domain & HTTPS** — your app domain and the apex that career-site subdomains
  hang off.
- **Admin account** — your first login; can auto-generate a strong password.
- **Secrets** — `NEXTAUTH_SECRET`, `VELLUM_SECRET`, and the Postgres password are
  generated for you and written to `.env` (chmod 600).
- **AI** — optional. Recommends **Ollama Cloud** (with the exact steps to get a
  key); Anthropic and OpenAI are also supported. Every value is overridable per
  workspace later in **Settings → AI**.
- **HTTPS (Caddy)** — automatic Let's Encrypt certificates, including a wildcard
  cert for career-site subdomains.
- **Auto-updates (Watchtower)** — optional; keeps the app on the latest image.

### Prerequisites

- A Linux server with Docker Engine + the Compose plugin
  (`curl -fsSL https://get.docker.com | sh`).
- A domain you control, with DNS records pointing at the server's public IP:

  | Type | Host | Purpose |
  |---|---|---|
  | `A` | `vellum.example.com` | Admin app (where you sign in) |
  | `A` | `*.example.com` | Career sites (`acme.example.com`, …) |

- For **wildcard HTTPS**, a DNS-provider API token (Cloudflare is supported out
  of the box) so Caddy can solve the DNS-01 challenge for `*.example.com`.

### Deployment modes

| Mode | How updates work | Best for |
|---|---|---|
| **Prebuilt image** (default) | Watchtower auto-updates, or run `./update.sh` | Most installs |
| **Build from source** | `./update.sh` (git pull + rebuild) | Forks / local changes |

### Publishing your own image

Image mode needs a published image. Build and push one — `publish.sh` produces a
clean image (compiled output only, no secrets or internal docs) and defaults to
`linux/amd64` so it runs on a typical cloud VM:

```bash
docker login
./publish.sh        # prompts for namespace/name/version → yourname/vellum:latest
```

Then point `setup.sh` (or `APP_IMAGE` in `.env`) at that reference.

### Updating

```bash
./update.sh         # pulls the new image (or rebuilds from source), then restarts
```

Your data lives in named Docker volumes (`vellum_db`, `vellum_uploads`) and is
preserved across updates. Database migrations run automatically on start.

### Email & calendar

SMTP/IMAP are configured **per workspace** in Settings → Email — nothing to set
in `.env`. Calendar OAuth (Google / Microsoft) needs HTTPS callback URLs; see
the step-by-step walkthroughs in `.env.example`. CalDAV needs no server config.

---

## Logging in

**Local quick-start** seeds a demo admin:

| | |
|---|---|
| Email | `admin@vellum.local` |
| Password | `vellum` |

**Production install** has no demo account. You sign in with the admin email and
password you chose in `./setup.sh`. If you let the wizard generate the password,
it's printed once at the end of the run (and stored in `.env` as
`SEED_ADMIN_PASSWORD`) — save it somewhere safe.

Change either by setting `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `.env`
**before** the first `docker compose up`, or via Settings → Profile after
signing in.

---

## Inviting teammates

In **Settings → Team**, enter an email and pick a role. The OSS edition
doesn't ship an SMTP integration, so the invite link is:

1. Returned to the browser and shown in the success card
2. Printed to the server logs prefixed with `📨 INVITE for …`

Share the link with your teammate. They'll set their name + password and land
in your workspace.

---

## AI

By default Vellum uses **mocked AI responses** so every shimmer animation,
summary, and reply draft still works without an API key.

To use real AI, set in `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-xxxxx
ANTHROPIC_MODEL=claude-sonnet-4-5     # or claude-haiku-4-5
```

…and restart. The picker in Settings → AI & integrations also lets each
workspace override the model and store its own key.

The plumbing for **OpenAI / Google / Ollama** is in place (the provider
abstraction lives in `src/lib/ai.ts`) but only the Anthropic path is
wired through for real completions in the MVP.

---

## Stack

- **Next.js 15** (App Router) — admin SPA + SSR career sites in one binary
- **Postgres 16** via Prisma 5 — strict multi-tenant (`workspaceId` on every
  table)
- **NextAuth.js (Credentials)** — JWT sessions, bcrypt-hashed passwords,
  token-based invites
- **@dnd-kit** — accessible drag-and-drop on the Kanban
- **@anthropic-ai/sdk** — AI provider, mockable
- **imapflow + nodemailer + mailparser** — per-workspace inbound IMAP polling
  and outbound SMTP, credentials AES-256-GCM encrypted at rest
- **Plain CSS** for the design system — see `src/app/globals.css`

A single subdomain-aware middleware (`middleware.ts`) routes requests:

- `<slug>.<PUBLIC_DOMAIN>/…` → server-rendered career site
- Anything else → the admin app (requires auth)

---

## Local dev (without Docker)

You still need Postgres. The easiest path is to keep the DB in Docker and run
the Next.js app on the host:

```bash
docker compose up -d db
cp .env.example .env
# point DATABASE_URL at localhost:
sed -i '' 's|@db:5432|@localhost:5432|' .env

npm install
npx prisma migrate deploy
npm run db:seed
npm run dev          # http://localhost:3000
```

---

## Project layout

```
prisma/
  schema.prisma          # 15+ models — Workspace, Job, Candidate, Application,
                         # Thread, Message, Interview, CareerSite, AIConfig, …
  seed.ts                # admin user + goscore demo workspace
middleware.ts            # subdomain → admin vs careers rewrite
src/
  lib/
    auth.ts              # NextAuth config + password hashing
    db.ts                # Prisma client singleton
    ai.ts                # Provider abstraction (Anthropic + mock fallback)
    workspace.ts         # requireWorkspace() — resolves current ws from cookie
    design.ts            # ACCENTS, AI_PROVIDERS, DEFAULT_STAGES
    utils.ts             # slug/token/relativeTime helpers
    seed-demo.ts         # demo jobs / candidates / threads
  components/
    primitives.tsx       # Glass, Chip, Avatar, AIPill, RingScore, WorkspaceMark
    Icons.tsx            # Original lucide-inspired SVG icons
    Sidebar.tsx          # Workspace switcher + nav
    Topbar.tsx           # Search, notifications, theme toggle
    ThemeBoot.tsx        # data-theme / accent / density boot
    ScheduleModal.tsx    # Interview scheduling sheet
    SessionProvider.tsx  # NextAuth client wrapper
  app/
    layout.tsx           # Root HTML shell
    globals.css          # Liquid Glass design tokens + primitives
    page.tsx             # → /dashboard or /login
    (auth)/              # Login + invite acceptance pages
    onboarding/          # First-run + new-workspace flow
    (admin)/             # Auth-gated admin app: dashboard, pipeline, jobs,
                         # candidates, inbox, analytics, settings, career, profile
    careers/[workspace]/ # Public SSR career site + job detail + apply form
    api/                 # REST endpoints under /api/*
```

---

## API surface (admin requests come with cookie-based auth)

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/[...nextauth]` | Sign in / out |
| `POST /api/invites` | Create teammate invite |
| `POST /api/invites/accept` | Accept invite + set password |
| `POST /api/workspace/create` | Create a new workspace |
| `PATCH /api/workspace` | Update name/domain/color |
| `DELETE /api/workspace` | Delete the workspace (owner only) |
| `GET /api/workspace/export` | Download workspace data as JSON |
| `POST /api/workspaces/switch` | Switch active workspace |
| `POST /api/preferences` | Theme / density / accent |
| `POST /api/jobs` · `PATCH /api/jobs/:id` · `DELETE /api/jobs/:id` | Job CRUD |
| `PATCH /api/applications/:id` | Move stage / archive |
| `POST /api/threads` | Open a conversation |
| `PATCH /api/threads/:id` | Star / mark unread |
| `POST /api/threads/:id/messages` | Send an internal-only message |
| `POST /api/threads/:id/send-email` | Send via SMTP when email is configured |
| `GET /api/applications/:id/sheet` | Hydrate the shared ProfileSheet modal |
| `PUT /api/email-account` · `DELETE /api/email-account` | Save / disconnect IMAP+SMTP |
| `POST /api/email-account/test` · `POST /api/email-account/poll` | Verify / fetch new mail now |
| `POST /api/candidates/:id/notes` | Internal team note |
| `POST /api/interviews` | Schedule interview |
| `PATCH /api/career-site` | Update career site content (sanitized rich text) |
| `PATCH /api/ai-config` | Workspace AI settings |
| `GET /api/ai/test` | Smoke-test the configured provider |
| `POST /api/ai/candidate-summary` · `POST /api/ai/draft-reply` · `POST /api/ai/rewrite-jd` | AI helpers |
| `POST /api/public/apply` | Public application submission |

---

## What's intentionally still rough

These follow naturally from the design notes (see `PRODUCT_NOTES.md`) but
were out of scope for the local MVP:

- **Calendar OAuth** — the Schedule modal saves interviews but doesn't push
  invites to Google / Outlook calendars yet.
- **Wildcard SSL for prod** — the CNAME UI shows the record HR needs to
  create; the routing layer (Caddy / Cloudflare) is a deployment concern.
- **PII redaction & no-log enforcement** — the toggles exist; only the
  Anthropic no-log header is plumbed.
- **OpenAI / Google / Ollama** — provider picker is in the UI, but only
  Anthropic is wired to real calls. The abstraction is ready in `lib/ai.ts`.
- **pgvector / semantic search** — the schema doesn't ship a vector column
  yet. Search is keyword today.
- **Email scaling** — IMAP polling runs inside the Next.js process on a
  3-minute interval. Fine for one-org self-hosted; multi-tenant SaaS will
  want a dedicated worker and per-account IDLE.

---

## Email integration

Each workspace can connect its own shared inbox (e.g. `careers@yourdomain.com`)
under **Settings → Email**:

- **Inbound**: IMAP poll every 3 minutes (`EMAIL_POLL_INTERVAL_MS` to tune).
  Messages from senders matching a known candidate's email are appended to the
  most recent thread; unknown senders are ignored.
- **Outbound**: SMTP send from the configured From identity, with proper
  `In-Reply-To` / `References` headers so the candidate's mail client threads
  the reply.
- **Storage**: IMAP and SMTP passwords are encrypted with AES-256-GCM, keyed
  off `VELLUM_SECRET` (falls back to `NEXTAUTH_SECRET`). Plaintext never
  touches the database.
- **Manual ops**: *Test connection* verifies both halves; *Poll now* fetches
  immediately without waiting for the next tick.

Disable the worker entirely with `EMAIL_POLL_DISABLED=1`.

---

## Applicant ProfileSheet

Clicking an applicant anywhere in the app (Pipeline cards, Candidates list)
opens the **ProfileSheet** modal from the design — four tabs (Overview,
Resume, Communication, Timeline), inline CV preview (PDF / image / download
fallback), AI summary regeneration, stage moves, and threaded messaging that
routes through SMTP when configured.

---

## Career site content

Settings → Career site uses a small WYSIWYG editor (bold/italic/lists/links,
sanitized server-side via `src/lib/sanitize.ts`) for the lede, about blocks,
team-story quotes, and footer CTA body. Offices, team stories, and a roles
filter live alongside the existing values + stats sections.

---

## License

Vellum is licensed under the **GNU Affero General Public License v3.0**
(AGPL-3.0) — see [`LICENSE`](LICENSE).

Copyright (C) 2026 MG Tech AS.

AGPL keeps Vellum genuinely open source while closing the SaaS loophole: anyone
who runs a modified version as a network service must make the corresponding
source available to its users (AGPL §13). That's the deliberate trade-off here —
adopt, self-host, and modify freely, but you can't fork it into a closed hosted
product without sharing your changes.
