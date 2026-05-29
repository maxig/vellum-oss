#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 MG Tech AS

#
# Vellum — guided installer for a fresh server.
#
# Walks you through everything needed to get a running, production-ready
# Vellum: checks Docker, collects config in a step-by-step wizard (press Enter
# to accept the [default] shown for any step), auto-generates strong secrets,
# optionally sets up automatic HTTPS (Caddy) and automatic image updates
# (Watchtower), then brings the stack up.
#
# Usage:   ./setup.sh
# Re-run:  safe — it reads your existing .env and offers the current values as
#          defaults, so you can change one thing without retyping everything.
#
set -euo pipefail

# Allow interactive prompts even when the script is piped in (curl | bash):
# reconnect stdin to the controlling terminal if one is actually openable.
if [ ! -t 0 ] && { : < /dev/tty; } 2>/dev/null; then exec < /dev/tty; fi

# ── pretty output ─────────────────────────────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
  BLUE=$'\033[34m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; CYAN=$'\033[36m'
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""; RED=""; CYAN=""
fi

step()  { printf '\n%s\n' "${BOLD}${BLUE}── $* ──${RESET}"; }
info()  { printf '%s\n' "${DIM}$*${RESET}"; }
ok()    { printf '%s\n' "${GREEN}✓ $*${RESET}"; }
warn()  { printf '%s\n' "${YELLOW}! $*${RESET}"; }
err()   { printf '%s\n' "${RED}✗ $*${RESET}" >&2; }
hr()    { printf '%s\n' "${DIM}··········································································${RESET}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
ENV_FILE="$SCRIPT_DIR/.env"

cat <<EOF
${BOLD}${CYAN}
  ╦  ╦┌─┐┬  ┬  ┬ ┬┌┬┐
  ╚╗╔╝├┤ │  │  │ ││││
   ╚╝ └─┘┴─┘┴─┘└─┘┴ ┴   ${RESET}${DIM}self-hosted, AI-first ATS${RESET}

${RESET}This wizard sets up Vellum on this machine. ${BOLD}Press Enter${RESET} to accept the
value in ${BOLD}[brackets]${RESET}. Optional steps can be skipped — you can change
anything later in the app's Settings or by re-running this script.
EOF

# ── prompt helpers ────────────────────────────────────────────────────
# ask VAR "Question" "default"   → free text, Enter keeps default
ask() {
  local __var="$1" __q="$2" __def="${3:-}" __ans
  if [ -n "$__def" ]; then
    read -r -p "$(printf '%s %s[%s]%s ' "$__q" "$DIM" "$__def" "$RESET")" __ans || true
    __ans="${__ans:-$__def}"
  else
    read -r -p "$(printf '%s ' "$__q")" __ans || true
  fi
  printf -v "$__var" '%s' "$__ans"
}

# asksecret VAR "Question"   → hidden input (no echo), no default
asksecret() {
  local __var="$1" __q="$2" __ans
  read -r -s -p "$(printf '%s ' "$__q")" __ans || true
  echo
  printf -v "$__var" '%s' "$__ans"
}

# yesno "Question" "Y|N"   → returns 0 for yes, 1 for no; Enter = default
yesno() {
  local __q="$1" __def="${2:-Y}" __ans __hint
  case "$__def" in Y|y) __hint="[Y/n]";; *) __hint="[y/N]";; esac
  while true; do
    read -r -p "$(printf '%s %s%s%s ' "$__q" "$DIM" "$__hint" "$RESET")" __ans || true
    __ans="${__ans:-$__def}"
    case "$__ans" in
      Y|y|yes|Yes|YES) return 0;;
      N|n|no|No|NO)    return 1;;
      *) warn "Please answer y or n.";;
    esac
  done
}

# read current value of KEY from existing .env (for re-runs), else echo arg2
env_default() {
  local key="$1" fallback="${2:-}"
  if [ -f "$ENV_FILE" ]; then
    local line
    line="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n1 || true)"
    if [ -n "$line" ]; then
      local v="${line#*=}"
      v="${v%\"}"; v="${v#\"}"   # strip surrounding quotes
      printf '%s' "$v"
      return 0
    fi
  fi
  printf '%s' "$fallback"
}

# generate a url-safe random secret of N chars (default 48). Pipe-safe under
# `set -o pipefail` — we collect output then slice with parameter expansion
# instead of closing a pipe early with `head -c`.
gen_secret() {
  local n="${1:-48}" s=""
  if command -v openssl >/dev/null 2>&1; then
    s="$(openssl rand -base64 $(( n * 2 )) 2>/dev/null | tr -dc 'A-Za-z0-9' || true)"
  fi
  if [ -z "$s" ] && [ -r /dev/urandom ]; then
    s="$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom 2>/dev/null | head -c "$(( n * 2 ))" || true)"
  fi
  if [ -z "$s" ]; then
    s="$( (date +%s%N; echo "$RANDOM$$") | sha256sum 2>/dev/null | tr -dc 'A-Za-z0-9' || true)"
  fi
  printf '%s' "${s:0:$n}"
}

# collected values are appended here as KEY=VALUE lines
declare -a ENV_LINES=()
put() { ENV_LINES+=("$1=\"$2\""); }       # quoted value
putc() { ENV_LINES+=("$1"); }             # raw line / comment / blank

# strip a possible :port and scheme down to a bare host
bare_host() {
  local h="$1"
  h="${h#http://}"; h="${h#https://}"
  h="${h%%/*}"; h="${h%%:*}"
  printf '%s' "$h"
}

# ══════════════════════════════════════════════════════════════════════
# 1. Docker preflight
# ══════════════════════════════════════════════════════════════════════
step "Step 1 · Checking Docker"

if ! command -v docker >/dev/null 2>&1; then
  err "Docker is not installed."
  cat <<EOF

Install Docker Engine + Compose first, then re-run this script:

  ${BOLD}Linux (recommended one-liner):${RESET}
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker \$USER   # then log out/in so the group applies

  ${BOLD}macOS / Windows:${RESET}
    Install Docker Desktop → https://docs.docker.com/get-docker/

Docs: https://docs.docker.com/engine/install/
EOF
  exit 1
fi
ok "docker found ($(docker --version 2>/dev/null | sed 's/,.*//'))"

# Compose v2 (plugin) or legacy docker-compose
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
  warn "Using legacy docker-compose. The v2 plugin (\"docker compose\") is recommended."
else
  err "Docker Compose not found."
  echo "Install the Compose plugin: https://docs.docker.com/compose/install/"
  exit 1
fi
ok "compose found ($($COMPOSE version 2>/dev/null | head -n1))"

# Is the daemon actually up / do we have permission?
if ! docker info >/dev/null 2>&1; then
  err "Can't talk to the Docker daemon."
  echo "Start Docker (e.g. 'sudo systemctl start docker') or, if you just added"
  echo "yourself to the 'docker' group, log out and back in. Then re-run."
  exit 1
fi
ok "Docker daemon is responsive"

if [ -f "$ENV_FILE" ]; then
  warn "An existing .env was found — its values are offered as defaults below."
  if ! yesno "Continue and update it?" "Y"; then echo "Aborted."; exit 0; fi
fi

# ══════════════════════════════════════════════════════════════════════
# 2. How will the app be deployed & updated?
# ══════════════════════════════════════════════════════════════════════
step "Step 2 · Deployment mode"
if [ ! -f Dockerfile ] || [ ! -d src ]; then
  # Minimal install (e.g. via setup-all.sh): no app source on disk, so building
  # from source isn't possible — use a prebuilt image.
  DEPLOY_MODE="image"
  info "No app source in this folder — using a prebuilt image."
else
  cat <<EOF
${DIM}How should the Vellum app container be obtained?${RESET}

  ${BOLD}1) Prebuilt image${RESET} (recommended) — pull a published image and let
     Watchtower keep it up to date automatically.
  ${BOLD}2) Build from source${RESET} — build the image on this server from the repo.
     Best for forks/local changes. Update later with ./update.sh.
EOF
  ask DEPLOY_CHOICE "Choose 1 or 2:" "1"
  if [ "$DEPLOY_CHOICE" = "2" ]; then
    DEPLOY_MODE="source"
    ok "Source mode — image will be built locally."
  else
    DEPLOY_MODE="image"
    ok "Image mode — a prebuilt image will be pulled."
  fi
fi
ask APP_IMAGE "  Image reference:" "$(env_default APP_IMAGE "${APP_IMAGE:-${VELLUM_IMAGE:-maxig/vellum-oss:latest}}")"

# ══════════════════════════════════════════════════════════════════════
# 3. Networking / public URL
# ══════════════════════════════════════════════════════════════════════
step "Step 3 · Where will Vellum be reached?"
cat <<EOF
${DIM}This sets the public URL admins use to sign in, and the apex that public
career-site subdomains hang off (e.g. apex example.com → acme.example.com).${RESET}
EOF

USE_HTTPS=1
if yesno "Serve over HTTPS on a real domain (recommended for any public server)?" "Y"; then
  USE_HTTPS=1
else
  USE_HTTPS=0
fi

if [ "$USE_HTTPS" = "1" ]; then
  ask APP_DOMAIN "App domain (where you sign in), e.g. vellum.example.com:" "$(env_default APP_DOMAIN)"
  while [ -z "$APP_DOMAIN" ]; do warn "An app domain is required for HTTPS."; ask APP_DOMAIN "App domain:" ""; done
  APP_DOMAIN="$(bare_host "$APP_DOMAIN")"

  CAREER_APEX_DEFAULT="$(env_default PUBLIC_DOMAIN_BARE)"
  if [ -z "$CAREER_APEX_DEFAULT" ]; then
    # default to the registrable part of the app domain (drop the leftmost label)
    case "$APP_DOMAIN" in
      *.*.*) CAREER_APEX_DEFAULT="${APP_DOMAIN#*.}";;
      *)     CAREER_APEX_DEFAULT="$APP_DOMAIN";;
    esac
  fi
  ask CAREER_APEX "Apex for career-site subdomains (slug.<apex>):" "$CAREER_APEX_DEFAULT"
  CAREER_APEX="$(bare_host "$CAREER_APEX")"

  ask ACME_EMAIL "Email for Let's Encrypt expiry notices:" "$(env_default ACME_EMAIL "$(env_default SEED_ADMIN_EMAIL)")"

  APP_ORIGIN="https://$APP_DOMAIN"
  NEXTAUTH_URL="https://$APP_DOMAIN"
  PUBLIC_DOMAIN="$CAREER_APEX"
  WEB_BIND="127.0.0.1"   # Caddy fronts it; no need to expose directly
  ok "App:    $APP_ORIGIN"
  ok "Careers: https://<slug>.$CAREER_APEX"
else
  info "Plain HTTP mode — good for a local/internal/test box. You can put your"
  info "own TLS proxy in front later."
  ask PLAIN_HOST "Host:port the app is reached at, e.g. 203.0.113.10:3000 or localhost:3000:" "$(bare_host "$(env_default APP_ORIGIN "localhost")"):$(env_default WEB_PORT 3000)"
  APP_ORIGIN="http://$PLAIN_HOST"
  NEXTAUTH_URL="http://$PLAIN_HOST"
  PUBLIC_DOMAIN="$PLAIN_HOST"
  ask WEB_PORT "Host port to expose the app on:" "$(env_default WEB_PORT 3000)"
  if yesno "Expose it on all network interfaces (needed for remote access)?" "Y"; then
    WEB_BIND="0.0.0.0"
  else
    WEB_BIND="127.0.0.1"
  fi
  APP_DOMAIN=""; CAREER_APEX=""; ACME_EMAIL=""
fi
WEB_PORT="$(env_default WEB_PORT 3000)"

# ══════════════════════════════════════════════════════════════════════
# 4. Admin account
# ══════════════════════════════════════════════════════════════════════
step "Step 4 · Your admin account"
info "This is the first login. On first sign-in you'll create your real workspace."
ask SEED_ADMIN_EMAIL "Admin email:" "$(env_default SEED_ADMIN_EMAIL "admin@${APP_DOMAIN:-vellum.local}")"
ask SEED_ADMIN_NAME  "Your name:" "$(env_default SEED_ADMIN_NAME "Admin")"

ADMIN_PW_DEFAULT="$(env_default SEED_ADMIN_PASSWORD)"
ADMIN_PW_GENERATED=0
if [ -n "$ADMIN_PW_DEFAULT" ] && [ "$ADMIN_PW_DEFAULT" != "vellum" ]; then
  if yesno "Keep the existing admin password?" "Y"; then
    SEED_ADMIN_PASSWORD="$ADMIN_PW_DEFAULT"
  fi
fi
if [ -z "${SEED_ADMIN_PASSWORD:-}" ]; then
  if yesno "Auto-generate a strong admin password?" "Y"; then
    SEED_ADMIN_PASSWORD="$(gen_secret 20)"
    ADMIN_PW_GENERATED=1
    ok "Generated a 20-character admin password (shown at the end)."
  else
    while true; do
      asksecret SEED_ADMIN_PASSWORD "Admin password:"
      asksecret _pw2 "Confirm password:"
      [ "$SEED_ADMIN_PASSWORD" = "$_pw2" ] && [ -n "$SEED_ADMIN_PASSWORD" ] && break
      warn "Passwords didn't match (or were empty). Try again."
    done
  fi
fi

# Clean install: no demo data (per requirement).
SEED_DEMO="false"

# ══════════════════════════════════════════════════════════════════════
# 5. Secrets (auto-generated)
# ══════════════════════════════════════════════════════════════════════
step "Step 5 · Generating secure secrets"
NEXTAUTH_SECRET="$(env_default NEXTAUTH_SECRET)"
case "$NEXTAUTH_SECRET" in ""|change-me*) NEXTAUTH_SECRET="$(gen_secret)";; esac
VELLUM_SECRET="$(env_default VELLUM_SECRET)"
case "$VELLUM_SECRET" in ""|change-me*) VELLUM_SECRET="$(gen_secret)";; esac
POSTGRES_PASSWORD="$(env_default POSTGRES_PASSWORD)"
case "$POSTGRES_PASSWORD" in ""|vellum) POSTGRES_PASSWORD="$(gen_secret 32)";; esac
POSTGRES_USER="$(env_default POSTGRES_USER vellum)"
POSTGRES_DB="$(env_default POSTGRES_DB vellum)"
ok "NEXTAUTH_SECRET, VELLUM_SECRET, and the Postgres password are set."
info "(VELLUM_SECRET encrypts calendar/email credentials at rest — keep it stable.)"

# ══════════════════════════════════════════════════════════════════════
# 6. AI provider (optional)
# ══════════════════════════════════════════════════════════════════════
step "Step 6 · AI provider ${DIM}(optional)${RESET}"
cat <<EOF
${DIM}Vellum's AI features (candidate summaries, reply drafts, JD rewrites) work
without any key — they return high-quality mock responses. Add a provider to
turn on real AI. You can also set/override this per workspace later in
Settings → AI & integrations.${RESET}

  ${BOLD}1) Ollama Cloud${RESET} ${GREEN}(recommended)${RESET} — hosted open models, free tier, fast setup.
  ${BOLD}2) Anthropic${RESET} (Claude)
  ${BOLD}3) OpenAI${RESET}
  ${BOLD}4) Skip${RESET} — use mock AI for now (turn it on later in Settings).
EOF
ask AI_CHOICE "Choose 1-4:" "1"

AI_PROVIDER=""; ANTHROPIC_API_KEY="$(env_default ANTHROPIC_API_KEY)"
ANTHROPIC_MODEL="$(env_default ANTHROPIC_MODEL claude-sonnet-4-5)"
OPENAI_API_KEY="$(env_default OPENAI_API_KEY)"; OPENAI_MODEL="$(env_default OPENAI_MODEL gpt-4o-mini)"
OLLAMA_BASE_URL="$(env_default OLLAMA_BASE_URL)"; OLLAMA_MODEL="$(env_default OLLAMA_MODEL llama3.1)"
OLLAMA_API_KEY="$(env_default OLLAMA_API_KEY)"

case "$AI_CHOICE" in
  1)
    AI_PROVIDER="ollama"
    OLLAMA_BASE_URL="https://ollama.com"
    cat <<EOF

${BOLD}Get an Ollama Cloud API key:${RESET}
  1. Sign in at ${CYAN}https://ollama.com${RESET}
  2. Open ${CYAN}https://ollama.com/settings/keys${RESET}
  3. Click ${BOLD}Create key${RESET}, copy it, paste below.
${DIM}Leave blank to skip for now — AI stays mocked until you add a key here or
in Settings.${RESET}
EOF
    asksecret OLLAMA_API_KEY "Ollama Cloud API key:"
    # llama3.1 is the generic local default; for Ollama Cloud suggest a hosted
    # model instead (others: gpt-oss:20b, qwen3-coder:480b, deepseek-v3.1:671b).
    OLLAMA_MODEL_DEFAULT="$OLLAMA_MODEL"
    case "$OLLAMA_MODEL_DEFAULT" in ""|llama3.1) OLLAMA_MODEL_DEFAULT="gpt-oss:120b";; esac
    ask OLLAMA_MODEL "Model:" "$OLLAMA_MODEL_DEFAULT"
    [ -n "$OLLAMA_API_KEY" ] && ok "Ollama Cloud configured ($OLLAMA_MODEL)." || warn "No key entered — AI will stay mocked."
    ;;
  2)
    AI_PROVIDER="anthropic"
    cat <<EOF

${BOLD}Get an Anthropic API key:${RESET}
  1. ${CYAN}https://console.anthropic.com${RESET} → API keys → Create key
  2. Paste below (starts with sk-ant-…).
EOF
    asksecret ANTHROPIC_API_KEY "Anthropic API key:"
    ask ANTHROPIC_MODEL "Model:" "${ANTHROPIC_MODEL}"
    [ -n "$ANTHROPIC_API_KEY" ] && ok "Anthropic configured ($ANTHROPIC_MODEL)." || warn "No key entered — AI will stay mocked."
    ;;
  3)
    AI_PROVIDER="openai"
    cat <<EOF

${BOLD}Get an OpenAI API key:${RESET}
  1. ${CYAN}https://platform.openai.com/api-keys${RESET} → Create new secret key
  2. Paste below (starts with sk-…).
EOF
    asksecret OPENAI_API_KEY "OpenAI API key:"
    ask OPENAI_MODEL "Model:" "${OPENAI_MODEL}"
    [ -n "$OPENAI_API_KEY" ] && ok "OpenAI configured ($OPENAI_MODEL)." || warn "No key entered — AI will stay mocked."
    ;;
  *)
    info "Skipping AI — mock responses for now. Add a provider anytime in Settings → AI."
    ;;
esac

# ══════════════════════════════════════════════════════════════════════
# 7. HTTPS / reverse proxy (Caddy)
# ══════════════════════════════════════════════════════════════════════
PROFILES=()
USE_CADDY=0
WILDCARD=0
CADDY_DNS_MODULE=""
CF_API_TOKEN="$(env_default CF_API_TOKEN)"

if [ "$USE_HTTPS" = "1" ]; then
  step "Step 7 · Automatic HTTPS (Caddy)"
  info "Caddy will obtain & renew TLS certificates automatically."
  USE_CADDY=1
  PROFILES+=("proxy")

  cat <<EOF

${DIM}Career sites live on subdomains (slug.$CAREER_APEX). To give those HTTPS too,
Caddy needs a ${BOLD}wildcard certificate${RESET}, which requires a DNS-01 challenge via
your DNS provider's API. The app domain itself works without this.${RESET}
EOF
  if yesno "Enable wildcard HTTPS for career-site subdomains?" "Y"; then
    WILDCARD=1
    cat <<EOF

${DIM}Wildcard certs are issued through your DNS provider. Cloudflare is supported
out of the box; other providers are possible by editing Dockerfile.caddy +
Caddyfile after setup.${RESET}

  ${BOLD}1) Cloudflare${RESET} (automated here)
  ${BOLD}2) Other / I'll configure the DNS plugin myself${RESET}
EOF
    ask DNS_CHOICE "Choose 1 or 2:" "1"
    if [ "$DNS_CHOICE" = "1" ]; then
      CADDY_DNS_MODULE="github.com/caddy-dns/cloudflare"
      cat <<EOF

${BOLD}Create a Cloudflare API token:${RESET}
  1. ${CYAN}https://dash.cloudflare.com/profile/api-tokens${RESET} → Create Token
  2. Use template ${BOLD}Edit zone DNS${RESET}
  3. Zone Resources → Include → your domain ($CAREER_APEX)
  4. Create, copy the token, paste below.
${DIM}Also make sure a wildcard DNS record *.$CAREER_APEX (and $APP_DOMAIN) points
at this server's public IP.${RESET}
EOF
      asksecret CF_API_TOKEN "Cloudflare API token:"
      [ -n "$CF_API_TOKEN" ] || warn "No token — wildcard issuance will fail until CF_API_TOKEN is set in .env."
    else
      CADDY_DNS_MODULE="github.com/caddy-dns/cloudflare"
      warn "Pick your provider's module from https://github.com/orgs/caddy-dns/repositories"
      warn "then edit Dockerfile.caddy (the --with line) and the tls{} block in Caddyfile."
    fi
  else
    info "Only $APP_DOMAIN will get a cert. Career subdomains will need manual TLS."
  fi
else
  step "Step 7 · Reverse proxy"
  info "Skipped (plain HTTP mode). The app will be exposed on port $WEB_PORT."
fi

# ══════════════════════════════════════════════════════════════════════
# 8. Automatic updates (Watchtower)
# ══════════════════════════════════════════════════════════════════════
step "Step 8 · Automatic updates ${DIM}(Watchtower, optional)${RESET}"
WATCHTOWER_APP_ENABLE="false"
WATCHTOWER_POLL_INTERVAL="$(env_default WATCHTOWER_POLL_INTERVAL 86400)"
if [ "$DEPLOY_MODE" = "image" ]; then
  cat <<EOF
${DIM}Watchtower can check the registry on a schedule and auto-update Vellum to the
latest published image (with a clean restart, no data loss).${RESET}
EOF
  if yesno "Enable automatic updates with Watchtower?" "Y"; then
    PROFILES+=("watchtower")
    WATCHTOWER_APP_ENABLE="true"
    ask WT_HOURS "Check for updates every how many hours?" "24"
    case "$WT_HOURS" in ''|*[!0-9]*) WT_HOURS=24;; esac
    WATCHTOWER_POLL_INTERVAL=$(( WT_HOURS * 3600 ))
    ok "Watchtower will check every ${WT_HOURS}h."
  else
    info "Skipped. Update manually anytime with ./update.sh."
  fi
else
  warn "Source mode: Watchtower can't rebuild from source, so it's skipped."
  info "Update with ./update.sh (git pull + rebuild)."
fi

# ══════════════════════════════════════════════════════════════════════
# 9. Write .env
# ══════════════════════════════════════════════════════════════════════
step "Step 9 · Writing configuration"

COMPOSE_PROFILES_STR="$(IFS=,; echo "${PROFILES[*]:-}")"
PUBLIC_DOMAIN_BARE="$(bare_host "${PUBLIC_DOMAIN}")"

# DATABASE_URL for host tooling; inside Docker the app derives its own.
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?schema=public"

if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
  info "Backed up previous .env"
fi

{
  echo "# Generated by setup.sh on $(date)"
  echo "# Re-run ./setup.sh to change anything. Comments live in .env.example."
  echo
  echo "# ── Deployment / updates ──"
  echo "DEPLOY_MODE=\"$DEPLOY_MODE\""
  echo "APP_IMAGE=\"$APP_IMAGE\""
  echo "COMPOSE_PROFILES=\"$COMPOSE_PROFILES_STR\""
  echo "WATCHTOWER_APP_ENABLE=\"$WATCHTOWER_APP_ENABLE\""
  echo "WATCHTOWER_POLL_INTERVAL=\"$WATCHTOWER_POLL_INTERVAL\""
  echo
  echo "# ── Postgres ──"
  echo "POSTGRES_USER=\"$POSTGRES_USER\""
  echo "POSTGRES_PASSWORD=\"$POSTGRES_PASSWORD\""
  echo "POSTGRES_DB=\"$POSTGRES_DB\""
  echo "POSTGRES_PORT=\"$(env_default POSTGRES_PORT 55432)\""
  echo "POSTGRES_BIND=\"127.0.0.1\""
  echo "DATABASE_URL=\"$DATABASE_URL\""
  echo
  echo "# ── Web / networking ──"
  echo "WEB_PORT=\"$WEB_PORT\""
  echo "WEB_BIND=\"$WEB_BIND\""
  echo "NEXTAUTH_SECRET=\"$NEXTAUTH_SECRET\""
  echo "NEXTAUTH_URL=\"$NEXTAUTH_URL\""
  echo "APP_ORIGIN=\"$APP_ORIGIN\""
  echo "PUBLIC_DOMAIN=\"$PUBLIC_DOMAIN\""
  echo "VELLUM_SECRET=\"$VELLUM_SECRET\""
  echo
  echo "# ── Reverse proxy / HTTPS (proxy profile) ──"
  echo "APP_DOMAIN=\"${APP_DOMAIN:-}\""
  echo "PUBLIC_DOMAIN_BARE=\"${PUBLIC_DOMAIN_BARE:-}\""
  echo "ACME_EMAIL=\"${ACME_EMAIL:-}\""
  echo "CF_API_TOKEN=\"${CF_API_TOKEN:-}\""
  echo
  echo "# ── Initial admin / seed ──"
  echo "SEED_ADMIN_EMAIL=\"$SEED_ADMIN_EMAIL\""
  echo "SEED_ADMIN_PASSWORD=\"$SEED_ADMIN_PASSWORD\""
  echo "SEED_ADMIN_NAME=\"$SEED_ADMIN_NAME\""
  echo "SEED_DEMO=\"$SEED_DEMO\""
  echo
  echo "# ── AI (override per workspace in Settings → AI) ──"
  echo "AI_PROVIDER=\"$AI_PROVIDER\""
  echo "ANTHROPIC_API_KEY=\"$ANTHROPIC_API_KEY\""
  echo "ANTHROPIC_MODEL=\"$ANTHROPIC_MODEL\""
  echo "OPENAI_API_KEY=\"$OPENAI_API_KEY\""
  echo "OPENAI_MODEL=\"$OPENAI_MODEL\""
  echo "OPENAI_BASE_URL=\"$(env_default OPENAI_BASE_URL)\""
  echo "OLLAMA_BASE_URL=\"$OLLAMA_BASE_URL\""
  echo "OLLAMA_MODEL=\"$OLLAMA_MODEL\""
  echo "OLLAMA_API_KEY=\"$OLLAMA_API_KEY\""
  echo
  echo "# ── Calendar OAuth (optional — see .env.example, or set up in Settings) ──"
  echo "GOOGLE_CLIENT_ID=\"$(env_default GOOGLE_CLIENT_ID)\""
  echo "GOOGLE_CLIENT_SECRET=\"$(env_default GOOGLE_CLIENT_SECRET)\""
  echo "GOOGLE_REDIRECT_URI=\"$(env_default GOOGLE_REDIRECT_URI)\""
  echo "MICROSOFT_CLIENT_ID=\"$(env_default MICROSOFT_CLIENT_ID)\""
  echo "MICROSOFT_CLIENT_SECRET=\"$(env_default MICROSOFT_CLIENT_SECRET)\""
  echo "MICROSOFT_TENANT=\"$(env_default MICROSOFT_TENANT common)\""
  echo "MICROSOFT_REDIRECT_URI=\"$(env_default MICROSOFT_REDIRECT_URI)\""
} > "$ENV_FILE"
chmod 600 "$ENV_FILE" 2>/dev/null || true
ok "Wrote $ENV_FILE (chmod 600)"

# ══════════════════════════════════════════════════════════════════════
# 10. Generate Caddy config (if used)
# ══════════════════════════════════════════════════════════════════════
if [ "$USE_CADDY" = "1" ]; then
  step "Step 10 · Generating Caddy config"

  if [ "$WILDCARD" = "1" ] && [ -n "$CADDY_DNS_MODULE" ]; then
    cat > "$SCRIPT_DIR/Dockerfile.caddy" <<EOF
# Generated by setup.sh — Caddy with a DNS plugin for wildcard (DNS-01) certs.
FROM caddy:2-builder AS builder
RUN xcaddy build --with $CADDY_DNS_MODULE
FROM caddy:2
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
EOF
    cat > "$SCRIPT_DIR/Caddyfile" <<'EOF'
# Generated by setup.sh
{
	email {$ACME_EMAIL}
}

# Admin app (exact host wins over the wildcard below)
{$APP_DOMAIN} {
	encode zstd gzip
	reverse_proxy app:3000
}

# Career-site subdomains: slug.<apex> — wildcard cert via DNS-01
*.{$PUBLIC_DOMAIN_BARE} {
	encode zstd gzip
	tls {
		dns cloudflare {env.CF_API_TOKEN}
	}
	reverse_proxy app:3000
}
EOF
    ok "Caddyfile + Dockerfile.caddy written (wildcard via Cloudflare DNS-01)."
    if [ "${DNS_CHOICE:-1}" != "1" ]; then
      warn "Remember to swap the module/provider for your DNS host (see comments above)."
    fi
  else
    # App-domain-only cert via HTTP/TLS-ALPN — stock Caddy, no plugin needed.
    cat > "$SCRIPT_DIR/Dockerfile.caddy" <<'EOF'
# Generated by setup.sh — stock Caddy (HTTP-01 / TLS-ALPN, app domain only).
FROM caddy:2
EOF
    cat > "$SCRIPT_DIR/Caddyfile" <<'EOF'
# Generated by setup.sh
{
	email {$ACME_EMAIL}
}

{$APP_DOMAIN} {
	encode zstd gzip
	reverse_proxy app:3000
}
EOF
    ok "Caddyfile + Dockerfile.caddy written (app domain only)."
  fi
fi

# ══════════════════════════════════════════════════════════════════════
# 11. Review & launch
# ══════════════════════════════════════════════════════════════════════
step "Step 11 · Review"
hr
printf '  %-22s %s\n' "Deployment:"   "$DEPLOY_MODE ($APP_IMAGE)"
printf '  %-22s %s\n' "App URL:"      "$APP_ORIGIN"
[ "$USE_HTTPS" = "1" ] && printf '  %-22s %s\n' "Career sites:" "https://<slug>.$CAREER_APEX"
printf '  %-22s %s\n' "Admin email:"  "$SEED_ADMIN_EMAIL"
printf '  %-22s %s\n' "Demo data:"    "skipped (clean install)"
printf '  %-22s %s\n' "AI provider:"  "${AI_PROVIDER:-mock}"
printf '  %-22s %s\n' "HTTPS (Caddy):" "$([ "$USE_CADDY" = 1 ] && echo "yes$([ "$WILDCARD" = 1 ] && echo " + wildcard")" || echo "no")"
printf '  %-22s %s\n' "Auto-updates:" "$([ "$WATCHTOWER_APP_ENABLE" = true ] && echo "Watchtower (every $((WATCHTOWER_POLL_INTERVAL/3600))h)" || echo "manual (./update.sh)")"
printf '  %-22s %s\n' "Profiles:"     "${COMPOSE_PROFILES_STR:-<none>}"
hr

if ! yesno "Start Vellum now?" "Y"; then
  cat <<EOF

No problem — everything is configured. When you're ready:

  ${BOLD}$([ "$DEPLOY_MODE" = source ] && echo "$COMPOSE up -d --build" || echo "$COMPOSE pull && $COMPOSE up -d")${RESET}

EOF
  exit 0
fi

step "Launching"
export COMPOSE_PROFILES="$COMPOSE_PROFILES_STR"
if [ "$DEPLOY_MODE" = "source" ]; then
  info "Building from source — this can take a few minutes the first time…"
  $COMPOSE up -d --build
else
  info "Pulling images…"
  # caddy is built locally even in image mode; --ignore-buildable keeps pull happy on old compose
  $COMPOSE pull app db || true
  [ "$USE_CADDY" = "1" ] && $COMPOSE build caddy
  $COMPOSE up -d
fi

echo
ok "Vellum is starting."
info "First boot runs DB migrations + seeds your admin user — give it ~20-40s."
echo
hr
printf '  %s\n' "${BOLD}${GREEN}Vellum is up.${RESET}"
printf '  %-12s %s\n' "URL:"      "$APP_ORIGIN"
printf '  %-12s %s\n' "Email:"    "$SEED_ADMIN_EMAIL"
if [ "$ADMIN_PW_GENERATED" = "1" ]; then
  printf '  %-12s %s\n' "Password:" "${BOLD}$SEED_ADMIN_PASSWORD${RESET}  ${DIM}(save this — generated)${RESET}"
else
  printf '  %-12s %s\n' "Password:" "(the one you set)"
fi
hr
cat <<EOF

Next:
  • Open ${CYAN}$APP_ORIGIN${RESET}, sign in, and create your first workspace.
  • Logs:    ${BOLD}$COMPOSE logs -f app${RESET}
  • Stop:    ${BOLD}$COMPOSE down${RESET}   (data is kept in named volumes)
  • Update:  ${BOLD}./update.sh${RESET}
$([ "$USE_HTTPS" = "1" ] && printf '  • DNS:     point %s and *.%s at this server'\''s public IP.\n' "$APP_DOMAIN" "$CAREER_APEX")
$([ -z "$AI_PROVIDER" ] && printf '  • AI:      currently mocked — add a provider in Settings → AI anytime.\n')
EOF
