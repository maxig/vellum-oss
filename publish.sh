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
# Version: auto-suggests the next free patch (bumps from package.json / the
# registry); override at the prompt or with VERSION=. Older versions stay
# published under their own tags, so you can always roll back.
#
# Usage:
#   ./publish.sh                       # interactive (auto-suggests next patch)
#   NAMESPACE=maxig ./publish.sh       # maxig/vellum-oss:<version> + :latest
#   VERSION=0.2.0 ./publish.sh         # explicit version override
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

# bump the patch component of a semver-ish version (1.2.3 → 1.2.4)
bump_patch() {
  local v="${1#v}" core ma mi pa _
  core="${v%%-*}"                       # drop any -prerelease suffix
  IFS=. read -r ma mi pa _ <<<"$core"
  [[ "$ma" =~ ^[0-9]+$ ]] || ma=0
  [[ "$mi" =~ ^[0-9]+$ ]] || mi=0
  [[ "$pa" =~ ^[0-9]+$ ]] || pa=0
  printf '%s.%s.%s' "$ma" "$mi" "$((pa + 1))"
}

# does this image tag already exist in the registry? (best-effort; false on any
# error, e.g. repo not found or no network)
tag_exists() { docker manifest inspect "$1" >/dev/null 2>&1; }

# ── preflight ──
command -v docker >/dev/null 2>&1 || { err "docker not found."; exit 1; }
docker buildx version >/dev/null 2>&1 || { err "docker buildx not found (needs Docker 19.03+ / Buildx)."; exit 1; }
docker info >/dev/null 2>&1 || { err "Docker daemon not reachable."; exit 1; }

step "Vellum image publisher"

REGISTRY="${REGISTRY:-docker.io}"
ask NAMESPACE "Registry namespace (your Docker Hub username or org):" "${NAMESPACE:-maxig}"
[ -n "$NAMESPACE" ] || { err "A namespace is required."; exit 1; }
ask IMAGE   "Image name:" "${IMAGE:-vellum-oss}"

# docker.io is implied by Docker Hub; don't prefix it into the tag.
if [ "$REGISTRY" = "docker.io" ]; then
  REF="$NAMESPACE/$IMAGE"
else
  REF="$REGISTRY/$NAMESPACE/$IMAGE"
fi

# Version: auto-suggest the next free patch. Start from package.json's version
# and advance past anything already published, so each release gets a fresh patch
# and previous versions stay put. Always overridable (prompt or VERSION=).
PKG_VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo 0.1.0)"
if [ -n "${VERSION:-}" ]; then
  DEF_VERSION="$VERSION"
else
  DEF_VERSION="$PKG_VERSION"
  if tag_exists "$REF:$DEF_VERSION"; then
    info "Looking up the next free patch for $REF…"
    n=0
    while tag_exists "$REF:$DEF_VERSION" && [ "$n" -lt 1000 ]; do
      DEF_VERSION="$(bump_patch "$DEF_VERSION")"; n=$((n + 1))
    done
  fi
fi
ask VERSION "Version tag:" "$DEF_VERSION"

# Default to amd64 — that's what most cloud servers run. Building amd64 on an
# Apple-Silicon host uses emulation (slower) but produces a server-ready image.
ask PLATFORMS "Target platform(s):" "${PLATFORMS:-linux/amd64}"

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

# Save the version: bump package.json so the next publish starts from here. The
# previous version isn't lost — it stays in the registry under its own tag.
if [ "$VERSION" != "$PKG_VERSION" ] && command -v node >/dev/null 2>&1; then
  node -e 'const fs=require("fs"),f="package.json",p=JSON.parse(fs.readFileSync(f));p.version=process.argv[1];fs.writeFileSync(f,JSON.stringify(p,null,2)+"\n")' "$VERSION" 2>/dev/null \
    && info "Bumped package.json: $PKG_VERSION → $VERSION — commit it (and sync to the public repo)."
fi

cat <<EOF

Use it on a server: run ${BOLD}./setup.sh${RESET} and, at the deployment step, set the
image reference to:

  ${CYAN}$REF:latest${RESET}

(or pre-seed it: ${BOLD}APP_IMAGE="$REF:latest"${RESET} in .env)

This release is also tagged ${BOLD}$REF:$VERSION${RESET}${GITSHA:+ and ${BOLD}$REF:git-$GITSHA${RESET}},
and older versions stay published — pin/roll back anytime with
${BOLD}APP_IMAGE="$REF:<version>"${RESET} then ./update.sh.
EOF
