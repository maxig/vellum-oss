#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 MG Tech AS

#
# Vellum — update to the latest version.
#
#   • Image mode:  pulls the newest published image and recreates the app.
#   • Source mode: git pull, then rebuilds the image from source.
#
# Your data lives in named Docker volumes and is preserved across updates.
# DB migrations run automatically on container start.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
else
  BOLD=""; DIM=""; RESET=""; GREEN=""; YELLOW=""
fi
ok()   { printf '%s\n' "${GREEN}✓ $*${RESET}"; }
info() { printf '%s\n' "${DIM}$*${RESET}"; }
warn() { printf '%s\n' "${YELLOW}! $*${RESET}"; }

[ -f .env ] || { echo "No .env found — run ./setup.sh first."; exit 1; }

# Resolve compose command
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then COMPOSE="docker-compose"
else echo "Docker Compose not found."; exit 1; fi

# Read DEPLOY_MODE from .env (default: image)
DEPLOY_MODE="$(grep -E '^DEPLOY_MODE=' .env 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '"' || true)"
DEPLOY_MODE="${DEPLOY_MODE:-image}"

printf '%s\n' "${BOLD}Updating Vellum (${DEPLOY_MODE} mode)…${RESET}"

if [ "$DEPLOY_MODE" = "source" ]; then
  if [ -d .git ]; then
    info "Pulling latest source…"
    git pull --ff-only || warn "git pull failed (local changes?) — continuing with current source."
  else
    warn "No git repo here; building from the source currently on disk."
  fi
  info "Rebuilding image…"
  $COMPOSE up -d --build
else
  info "Pulling latest image(s)…"
  $COMPOSE pull
  info "Recreating containers…"
  $COMPOSE up -d
fi

# Drop dangling images from the previous version
docker image prune -f >/dev/null 2>&1 || true

echo
ok "Update complete."
info "Logs: $COMPOSE logs -f app"
$COMPOSE ps
