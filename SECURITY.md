# Security Policy

We take the security of Vellum and its users seriously. Thank you for helping
keep self-hosted deployments safe.

## Supported versions

Vellum is an actively developed MVP. Security fixes target the **latest `main`**
and the most recent published image. If you run an older build, please update
(`./update.sh`) before reporting, in case the issue is already fixed.

| Version | Supported |
|---|---|
| Latest `main` / latest image | ✅ |
| Older builds | ❌ (please update first) |

## Reporting a vulnerability

**Please do not open a public issue, PR, or discussion for security
vulnerabilities** — that exposes users before a fix is available.

Instead, report privately via **either**:

1. **GitHub Security Advisories** (preferred) — go to the repo's
   **Security → [Report a vulnerability](https://github.com/maxig/vellum-oss/security/advisories/new)**
   tab to open a private advisory.
   _(Maintainers: enable "Private vulnerability reporting" in the repo's Security
   settings to make this available.)_
2. **Email** — `security@<your-domain>` _(maintainers: replace with a real,
   monitored address)_.

Please include:

- A description of the issue and its potential impact.
- Steps to reproduce (or a proof of concept).
- Affected version / commit, and your environment if relevant.
- Any suggested remediation, if you have one.

## What to expect

- **Acknowledgement** within a few business days.
- An initial assessment and severity rating, and we'll keep you updated on progress.
- **Coordinated disclosure:** we'll work on a fix privately, release it, and then
  publish an advisory. We're happy to credit you (or keep you anonymous — your call).

Please give us reasonable time to remediate before any public disclosure.

## Scope & hardening notes

This is self-hosted software — you operate the deployment, so a few things are in
your hands:

- Keep `.env` private; rotate `NEXTAUTH_SECRET` / `VELLUM_SECRET` if exposed.
- Serve over **HTTPS** in production (`setup.sh` can configure Caddy for you).
- Keep Docker images updated (Watchtower or `./update.sh`).
- Restrict database/network exposure; the defaults bind Postgres to loopback.

Thanks again for reporting responsibly. 🙏
