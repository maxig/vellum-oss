#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 MG Tech AS

set -e

echo "[vellum] running prisma migrate deploy..."
node node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma || {
  echo "[vellum] migrate deploy failed — attempting db push as a fallback (first run, no migrations folder)"
  node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss --schema=./prisma/schema.prisma
}

if [ ! -d ./prisma/migrations ]; then
  echo "[vellum] no migrations folder found — syncing schema with prisma db push..."
  node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss --schema=./prisma/schema.prisma
fi

echo "[vellum] seeding database (idempotent)..."
node node_modules/tsx/dist/cli.mjs prisma/seed.ts || echo "[vellum] seed already up to date"

echo "[vellum] starting server on ${PORT:-3000}"
exec "$@"
