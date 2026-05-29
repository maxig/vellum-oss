# Contributing to Vellum

Thanks for your interest in improving Vellum! 🎉 Issues, ideas, docs, testing,
and code are all welcome.

By participating, you agree to keep things friendly and constructive — we follow
the spirit of the [Contributor Covenant](https://www.contributor-covenant.org/).

---

## Ways to contribute

- 🐛 **Report a bug** — [open an issue](https://github.com/maxig/vellum-oss/issues/new) with steps to reproduce.
- 💡 **Request a feature** — describe the problem you're trying to solve, not just the solution.
- 📝 **Improve docs** — README, this guide, comments, examples.
- 🧪 **Test & triage** — reproduce reports, confirm fixes, suggest edge cases.
- 🔧 **Write code** — bug fixes and features. New here? Look for issues labeled
  [`good first issue`](https://github.com/maxig/vellum-oss/labels/good%20first%20issue).

For **security issues, do not open a public issue** — see [SECURITY.md](SECURITY.md).

---

## Development setup

You'll need **Docker** (for Postgres) and **Node.js 22+**.

```bash
# 1. Fork on GitHub, then clone your fork
git clone https://github.com/<your-username>/vellum-oss.git vellum
cd vellum

# 2. Start Postgres in Docker
docker compose up -d db

# 3. Configure + install
cp .env.example .env
npm install

# 4. Set up the database (schema + a demo workspace with sample data)
npm run prisma:push
npm run db:seed

# 5. Run the dev server
npm run dev          # http://localhost:3000
```

Sign in with the seeded admin (`admin@vellum.local` / `vellum`). The demo career
site is at <http://goscore.localhost:3000>.

> Prefer everything in containers? `docker compose up --build` runs the full
> stack (app + db) the same way production does.

**AI while developing:** features fall back to high-quality mocks with no key.
To exercise real AI, add a provider in `.env` (e.g. Ollama Cloud) or in
**Settings → AI**.

---

## Project layout

```
src/
  app/          Next.js App Router — admin app, public career sites, API routes
  components/   Shared UI (primitives, sheets, modals)
  lib/          Server logic — auth, db, ai, email, calendar, permissions, …
prisma/
  schema.prisma Data model (multi-tenant: workspaceId on every record)
  seed.ts       Admin user + optional demo workspace
```

---

## Making a change

1. **Create a branch:** `git checkout -b fix/short-description`.
2. **Keep it focused** — one logical change per PR. Small PRs get reviewed faster.
3. **Match the existing style:** TypeScript, plain CSS (no Tailwind), small focused
   components, server logic under `src/lib`.
4. **Add an SPDX header** to any new source file:
   ```ts
   // SPDX-License-Identifier: AGPL-3.0-or-later
   ```
5. **Build before you push:**
   ```bash
   npm run build      # type-checks + compiles (prisma generate + next build)
   npm run lint
   ```
6. **Describe how you tested it** in the PR.

### Commits

- Write clear, present-tense messages (e.g. "Add bulk archive to pipeline").
- **Sign off** your commits to certify the [DCO](https://developercertificate.org/):
  ```bash
  git commit -s -m "Add bulk archive to pipeline"
  ```

### Pull requests

- Open the PR against **`main`**.
- Fill in what changed, why, and how you verified it. Screenshots help for UI.
- A maintainer will review; please be responsive to feedback. Once merged, your
  change ships in the next release and Docker image.

---

## Licensing of contributions

Vellum is licensed under **[AGPL-3.0](LICENSE)**. By submitting a contribution,
you agree that your work is licensed under the same terms, and that you have the
right to submit it (the DCO sign-off above is how you certify this).

---

## Questions?

Open a [discussion or issue](https://github.com/maxig/vellum-oss/issues) — happy
to help you get started.
