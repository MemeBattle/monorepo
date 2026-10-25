#!/usr/bin/env bash
# Registers the `ligretto` client in the development database, so a fresh
# checkout has one OIDC client out of the box. Clients are never seeded by a
# migration: a migration runs everywhere, and a known secret must not reach
# production (docs/adr/0008-oidc-clients-registry.md).
#
# Usage: scripts/seed-dev.sh             (reads DATABASE_URL exactly like the app)
#        scripts/seed-dev.sh --dry-run   (prints the resolved arguments, runs nothing)
#
# Development only: it refuses to run with `APP_ENV` set to anything else.
#
# Not idempotent on purpose: a second run fails with "already exists", which
# is the signal that the client is there. There is no update path until the
# admin panel; re-register under another id, or reset the dev database.
#
# The secret is the stable development one from the monorepo's
# `.env.development`, passed with `--secret`, a flag that exists in
# development builds alone, so a fresh database and ligretto's checked-in
# development configuration agree without anyone copying a printed value
# (docs/adr/0023-dev-only-client-secret.md). An exported
# `LIGRETTO_CAS_CLIENT_SECRET` wins over the file, as it does for the backend
# that will present it.
#
# The redirect URI is ligretto-auth's callback on ligretto-core-backend
# (#814), on the port the same `.env.development` records for it. The
# post-logout URI is ligretto-frontend's origin in the local SSO stack, which
# it serves when started as
#
#   pnpm --filter @memebattle/ligretto-frontend start:dev --port 5174 --strictPort
#
# with no `--` separator: pnpm forwards the flags into the script, while a
# separator makes Vite's parser drop everything after it and bind its default
# 5173 — which is the CAS frontend's port. Both URIs are matched byte for
# byte, so changing one means re-registering the client.
#
# The audience is what ligretto's backends expect in the `aud` of an access
# token. It equals the id, and is spelled out because it is a contract with
# those backends rather than a consequence of the client's name
# (docs/adr/0011-token-endpoint-and-access-tokens.md).
set -euo pipefail
cd "$(dirname "$0")/.."

usage() {
  echo "usage: scripts/seed-dev.sh [--dry-run]" >&2
  exit 2
}

# An extra or unknown argument is refused rather than ignored, so --dry-run
# prints what a real run would register.
dry_run=false
[ "$#" -le 1 ] || usage
case "${1-}" in
"") ;;
--dry-run) dry_run=true ;;
*) usage ;;
esac

# Seeding is for the development environment alone. The cas-client below
# selects its own .env files from APP_ENV (src/config/native.rs::load_env_files)
# when it resolves DATABASE_URL, so under another APP_ENV it would write the
# values resolved here from the development files into that environment's
# database.
app_env=${APP_ENV-development}
if [ "$app_env" != development ]; then
  echo "error: seed-dev.sh seeds the development environment, but APP_ENV is '$app_env'" >&2
  exit 1
fi

# A value with the precedence of the loader ligretto-core-backend reads:
# dotenv-flow under NODE_ENV=development
# (apps/ligretto-core-backend/src/entry/env.ts), where a real environment
# variable always wins, then the package's own .env.development.local,
# .env.development, .env.local, .env, .env.defaults, then the monorepo root's
# files in the same order. dotenv-flow merges a directory's files so that the
# later one in its list overwrites the earlier, which puts .env.development
# above .env.local: a .env.local value of a key the committed .env.development
# sets never reaches the backend, and only .env.development.local overrides
# it. The loop below follows exactly that order. Within one directory it is
# CAS's own order too (src/config/native.rs::load_env_files); the difference
# is that CAS reads the monorepo root alone, while the backend reads its
# package directory first.
#
# The secret is why: the backend presents it through that loader, so an
# export, or an override written in a .env.development.local of the package
# or the root, reaches the seeded row and the backend alike — the two halves
# have to agree. The port is read from the same files only to keep the number
# out of this script; it is not a knob, and the monorepo's .env.development
# says why.
#
# The files are never `source`d — that would overwrite an exported value, and
# the seeded row would then disagree with a backend started from the same
# environment. They hold plain unquoted KEY=value lines, and the parser lets a
# later line of a file overwrite an earlier one, so the last matching line of
# the first file that has one is the value.
env_value() {
  local name=$1
  local value
  if value=$(printenv "$name"); then
    printf '%s' "$value"
    return
  fi
  local file line
  for file in \
    ../ligretto-core-backend/.env.development.local ../ligretto-core-backend/.env.development \
    ../ligretto-core-backend/.env.local ../ligretto-core-backend/.env \
    ../ligretto-core-backend/.env.defaults \
    ../../.env.development.local ../../.env.development ../../.env.local ../../.env \
    ../../.env.defaults; do
    [ -f "$file" ] || continue
    if line=$(grep "^${name}=" "$file" | tail -n 1); then
      printf '%s' "${line#*=}"
      return
    fi
  done
  echo "error: $name is set nowhere: export it, or add it to .env.development" >&2
  exit 1
}

core_backend_port=$(env_value LIGRETTO_CORE_BACKEND_PORT)
client_secret=$(env_value LIGRETTO_CAS_CLIENT_SECRET)

args=(
  register
  --id ligretto
  --name Ligretto
  --kind confidential
  --redirect-uri "http://localhost:${core_backend_port}/api/auth/callback"
  --post-logout-redirect-uri http://localhost:5174/
  --first-party
  --guest-login-allowed
  --scope openid
  --scope profile
  --scope email
  --audience ligretto
  --secret "$client_secret"
)

if [ "$dry_run" = true ]; then
  printf '%s\n' "${args[@]}"
  exit 0
fi

cargo run -p cas --bin cas-client -- "${args[@]}"
