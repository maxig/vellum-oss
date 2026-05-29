#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 MG Tech AS

#
# Vellum — build & publish the app image to a registry (Docker Hub by default).
#
# Produces a clean, multi-arch-capable image from the Dockerfile's `runner`
# stage (compiled output only — no source docs, specs, or secrets) and pushes
# it so a server can pull it via setup.sh's "image mode".
#
# Usage:
#   ./publish.sh                       # interactive
#   NAMESPACE=acme ./publish.sh        # acme/vellum:<version> + :latest
#   NAMESPACE=acme IMAGE=vellum VERSION=0.1.0 PLATFORMS=linux/amd64 ./publish.sh
#
set -euo pipefail

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; CYAN=$'\033[36m'; RED=$'\033[31m'
else
  BOLD=""; DIM=""; RESET=""; GREEN=""; YELLOW=""; CYAN=""; RED=""
fi
step() { printf '\n%s\n' "${BOLD}── $* ──${RESET}"; }
ok()   { printf '%s\n' "${GREEN}✓ $*${RESET}"; }
info() { printf '%s\n' "${DIM}$*${RESET}"; }
warn() { printf '%s\n' "${YELLOW}! $*${RESET}"; }
err()  { printf '%s\n' "${RED}✗ $*${RESET}" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ask() {  # ask VAR "Q" "default"
  local __var="$1" __q="$2" __def="${3:-}" __ans
  if [ -n "$__def" ]; then
    read -r -p "$(printf '%s %s[%s]%s ' "$__q" "$DIM" "$__def" "$RESET")" __ans || true
    __ans="${__ans:-$__def}"
  else
    read -r -p "$(printf '%s ' "$__q")" __ans || true
  fi
  printf -v "$__var" '%s' "$__ans"
}
yesno() {
  local __q="$1" __def="${2:-Y}" __ans __hint
  case "$__def" in Y|y) __hint="[Y/n]";; *) __hint="[y/N]";; esac
  while true; do
    read -r -p "$(printf '%s %s%s%s ' "$__q" "$DIM" "$__hint" "$RESET")" __ans || true
    __ans="${__ans:-$__def}"
    case "$__ans" in Y|y|yes) return 0;; N|n|no) return 1;; *) warn "Answer y or n.";; esac
  done
}

# ── preflight ──
command -v docker >/dev/null 2>&1 || { err "docker not found."; exit 1; }
docker buildx version >/dev/null 2>&1 || { err "docker buildx not found (needs Docker 19.03+ / Buildx)."; exit 1; }
docker info >/dev/null 2>&1 || { err "Docker daemon not reachable."; exit 1; }

step "Vellum image publisher"

REGISTRY="${REGISTRY:-docker.io}"
ask NAMESPACE "Registry namespace (your Docker Hub username or org):" "${NAMESPACE:-maxig}"
[ -n "$NAMESPACE" ] || { err "A namespace is required."; exit 1; }
ask IMAGE   "Image name:" "${IMAGE:-vellum-oss}"
PKG_VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo 0.1.0)"
ask VERSION "Version tag:" "${VERSION:-$PKG_VERSION}"

# Default to amd64 — that's what most cloud servers run. Building amd64 on an
# Apple-Silicon host uses emulation (slower) but produces a server-ready image.
ask PLATFORMS "Target platform(s):" "${PLATFORMS:-linux/amd64}"

# docker.io is implied by Docker Hub; don't prefix it into the tag.
if [ "$REGISTRY" = "docker.io" ]; then
  REF="$NAMESPACE/$IMAGE"
else
  REF="$REGISTRY/$NAMESPACE/$IMAGE"
fi

TAGS=(-t "$REF:$VERSION" -t "$REF:latest")
GITSHA="$(git rev-parse --short HEAD 2>/dev/null || true)"
[ -n "$GITSHA" ] && TAGS+=(-t "$REF:git-$GITSHA")

step "Plan"
info "Build context : $SCRIPT_DIR (filtered by .dockerignore)"
info "Image         : $REF"
info "Tags          : $VERSION, latest${GITSHA:+, git-$GITSHA}"
info "Platforms     : $PLATFORMS"
yesno "Build and push now?" "Y" || { echo "Aborted."; exit 0; }

# ── ensure logged in ──
if ! docker system info 2>/dev/null | grep -q "Username:"; then
  warn "Not logged in to a registry. Running 'docker login $([ "$REGISTRY" = docker.io ] && echo "" || echo "$REGISTRY")'…"
  if [ "$REGISTRY" = "docker.io" ]; then docker login; else docker login "$REGISTRY"; fi
fi

# ── ensure a buildx builder that can do multi-platform ──
if ! docker buildx inspect vellum-builder >/dev/null 2>&1; then
  info "Creating buildx builder 'vellum-builder'…"
  docker buildx create --name vellum-builder --driver docker-container --use >/dev/null
else
  docker buildx use vellum-builder
fi
docker buildx inspect --bootstrap >/dev/null

step "Building & pushing"
docker buildx build \
  --platform "$PLATFORMS" \
  --target runner \
  "${TAGS[@]}" \
  --provenance=false \
  --push \
  .

echo
ok "Published $REF:$VERSION (and :latest)"
cat <<EOF

Use it on a server: run ${BOLD}./setup.sh${RESET} and, at the deployment step, set the
image reference to:

  ${CYAN}$REF:latest${RESET}

(or pre-seed it: ${BOLD}APP_IMAGE="$REF:latest"${RESET} in .env)
EOF
