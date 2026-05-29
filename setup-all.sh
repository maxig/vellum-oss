#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 MG Tech AS

#
# Vellum — one-shot bootstrap for people who don't want to think about Docker.
#
# It will:
#   1. update your server's packages,
#   2. install Docker + the Compose plugin (if missing),
#   3. download just the few files Vellum needs (no full repo clone), and
#   4. launch the guided installer (setup.sh).
#
# Run it straight off the internet — no git, no manual downloads:
#
#   curl -fsSL https://raw.githubusercontent.com/maxig/vellum-oss/main/setup-all.sh | sudo bash
#
# or download and run:
#
#   curl -fsSLO https://raw.githubusercontent.com/maxig/vellum-oss/main/setup-all.sh
#   sudo bash setup-all.sh
#
# Options (flags or env vars):
#   -y, --yes            Don't ask before updating packages / installing Docker
#   --dir   <path>       Install directory   (default: /opt/vellum as root, else ~/vellum)
#   --repo  <owner/name> Source repo          (default: maxig/vellum-oss)
#   --ref   <branch|tag> Source ref           (default: main)
#   --image <ref>        App image to deploy  (default: ask in setup.sh)
#
set -euo pipefail

# Reconnect stdin to the terminal so prompts work even via `curl | bash`.
# Only do it if /dev/tty is actually openable (skips CI / no-tty contexts).
if [ ! -t 0 ] && { : < /dev/tty; } 2>/dev/null; then exec < /dev/tty; fi

# ── pretty output ─────────────────────────────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'; BLUE=$'\033[34m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; CYAN=$'\033[36m'
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""; RED=""; CYAN=""
fi
step() { printf '\n%s\n' "${BOLD}${BLUE}── $* ──${RESET}"; }
info() { printf '%s\n' "${DIM}$*${RESET}"; }
ok()   { printf '%s\n' "${GREEN}✓ $*${RESET}"; }
warn() { printf '%s\n' "${YELLOW}! $*${RESET}"; }
err()  { printf '%s\n' "${RED}✗ $*${RESET}" >&2; }

# ── config / args ─────────────────────────────────────────────────────
ASSUME_YES="${ASSUME_YES:-0}"
VELLUM_REPO="${VELLUM_REPO:-maxig/vellum-oss}"
VELLUM_REF="${VELLUM_REF:-main}"
VELLUM_IMAGE="${VELLUM_IMAGE:-}"
VELLUM_DIR="${VELLUM_DIR:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    -y|--yes)   ASSUME_YES=1;;
    --dir)      VELLUM_DIR="${2:-}"; shift;;
    --repo)     VELLUM_REPO="${2:-}"; shift;;
    --ref)      VELLUM_REF="${2:-}"; shift;;
    --image)    VELLUM_IMAGE="${2:-}"; shift;;
    -h|--help)  grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    *) err "Unknown option: $1"; exit 1;;
  esac
  shift
done

RAW_BASE="${VELLUM_REPO_RAW:-https://raw.githubusercontent.com/$VELLUM_REPO/$VELLUM_REF}"

confirm() {  # confirm "Question" → 0/1 ; auto-yes when ASSUME_YES
  local q="$1"
  [ "$ASSUME_YES" = "1" ] && return 0
  local a; read -r -p "$(printf '%s %s[Y/n]%s ' "$q" "$DIM" "$RESET")" a || true
  case "${a:-Y}" in Y|y|yes|Yes) return 0;; *) return 1;; esac
}

cat <<EOF
${BOLD}${CYAN}
  Vellum — turnkey installer${RESET}
${DIM}This will update your system, install Docker, and set up Vellum.${RESET}
EOF

# ── platform / privilege ──────────────────────────────────────────────
step "Step 1 · Checking your system"

OS="$(uname -s)"
if [ "$OS" = "Darwin" ]; then
  err "This bootstrap is for Linux servers."
  cat <<EOF
On macOS, install ${BOLD}Docker Desktop${RESET} (https://docs.docker.com/get-docker/),
then clone the repo and run ./setup.sh:

  git clone https://github.com/$VELLUM_REPO vellum && cd vellum && ./setup.sh
EOF
  exit 1
fi
[ "$OS" = "Linux" ] || { err "Unsupported OS: $OS"; exit 1; }

# sudo wrapper — empty when we're already root
if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
  RUN_USER="${SUDO_USER:-root}"
else
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
    info "Some steps need root; you may be prompted for your password."
  else
    err "Please run as root (or install sudo). Try:  curl -fsSL <url> | sudo bash"
    exit 1
  fi
  RUN_USER="$(id -un)"
fi

# default install dir
if [ -z "$VELLUM_DIR" ]; then
  if [ "$(id -u)" -eq 0 ]; then VELLUM_DIR="/opt/vellum"; else VELLUM_DIR="$HOME/vellum"; fi
fi
ok "Linux detected. Install directory: $VELLUM_DIR"

# detect package manager
PKG=""
for c in apt-get dnf yum pacman zypper apk; do
  command -v "$c" >/dev/null 2>&1 && { PKG="$c"; break; }
done
[ -n "$PKG" ] && ok "Package manager: $PKG" || warn "No known package manager found — will skip OS updates."

# ── system update ─────────────────────────────────────────────────────
step "Step 2 · Updating system packages"
if [ -n "$PKG" ] && confirm "Update the OS to the latest packages now?"; then
  case "$PKG" in
    apt-get) $SUDO apt-get update -y && $SUDO DEBIAN_FRONTEND=noninteractive apt-get upgrade -y && $SUDO apt-get install -y ca-certificates curl;;
    dnf)     $SUDO dnf upgrade -y && $SUDO dnf install -y ca-certificates curl;;
    yum)     $SUDO yum update -y && $SUDO yum install -y ca-certificates curl;;
    pacman)  $SUDO pacman -Syu --noconfirm && $SUDO pacman -S --noconfirm --needed ca-certificates curl;;
    zypper)  $SUDO zypper --non-interactive update && $SUDO zypper --non-interactive install ca-certificates curl;;
    apk)     $SUDO apk update && $SUDO apk upgrade && $SUDO apk add ca-certificates curl;;
  esac
  ok "System packages updated."
else
  info "Skipped OS update."
  command -v curl >/dev/null 2>&1 || { [ -n "$PKG" ] && $SUDO "$PKG" install -y curl || true; }
fi

# ── docker ────────────────────────────────────────────────────────────
step "Step 3 · Installing Docker"
if command -v docker >/dev/null 2>&1; then
  ok "Docker already installed ($(docker --version 2>/dev/null | sed 's/,.*//'))."
else
  if confirm "Install Docker Engine + Compose now?"; then
    info "Running the official Docker install script…"
    curl -fsSL https://get.docker.com | $SUDO sh
    ok "Docker installed."
  else
    err "Docker is required. Aborting."
    exit 1
  fi
fi

# make sure the daemon is up (systemd hosts)
if command -v systemctl >/dev/null 2>&1; then
  $SUDO systemctl enable --now docker >/dev/null 2>&1 || true
fi

# add the invoking user to the docker group so they can run docker w/o sudo
DOCKER_VIA=""   # how we'll invoke docker for setup.sh
if [ "$(id -u)" -eq 0 ]; then
  DOCKER_VIA="root"
elif docker info >/dev/null 2>&1; then
  DOCKER_VIA="direct"
else
  if [ "$RUN_USER" != "root" ]; then
    $SUDO usermod -aG docker "$RUN_USER" 2>/dev/null || true
  fi
  if command -v sg >/dev/null 2>&1 && sg docker -c 'docker info' >/dev/null 2>&1; then
    DOCKER_VIA="sg"   # use group in this session without re-login
  else
    DOCKER_VIA="relogin"
  fi
fi

# ── fetch the minimal file set ────────────────────────────────────────
step "Step 4 · Downloading Vellum"
$SUDO mkdir -p "$VELLUM_DIR"
# make the dir writable by the invoking user when we created it as root
if [ -n "$SUDO" ] && [ "$RUN_USER" != "root" ]; then
  $SUDO chown "$RUN_USER":"$RUN_USER" "$VELLUM_DIR" 2>/dev/null || true
fi

fetch() {  # fetch <remote-path> <local-name>
  local url="$RAW_BASE/$1" dest="$VELLUM_DIR/$2"
  if curl -fsSL "$url" -o "$dest"; then ok "  $2"; else err "  failed to download $1 from $url"; return 1; fi
}
info "From $RAW_BASE"
fetch docker-compose.yml docker-compose.yml
fetch setup.sh          setup.sh
fetch update.sh         update.sh
fetch .env.example      .env.example
chmod +x "$VELLUM_DIR/setup.sh" "$VELLUM_DIR/update.sh" 2>/dev/null || true

# ── hand off to the guided installer ──────────────────────────────────
step "Step 5 · Launching the Vellum setup wizard"
cd "$VELLUM_DIR"
[ -n "$VELLUM_IMAGE" ] && export APP_IMAGE="$VELLUM_IMAGE"

if [ "$DOCKER_VIA" = "relogin" ]; then
  warn "Docker was just installed and your user isn't in the 'docker' group yet."
  cat <<EOF

Almost there! Log out and back in (or open a new SSH session), then finish with:

  ${BOLD}cd $VELLUM_DIR && ./setup.sh${RESET}

(That extra step is just how Linux applies the new 'docker' group permission.)
EOF
  exit 0
fi

case "$DOCKER_VIA" in
  sg)   exec sg docker -c "cd '$VELLUM_DIR' && exec bash ./setup.sh";;
  *)    exec bash ./setup.sh;;
esac
