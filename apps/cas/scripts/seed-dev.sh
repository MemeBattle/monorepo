#!/usr/bin/env bash
# Registers the `ligretto` client in the development database, so a fresh
# checkout has one OIDC client out of the box. Clients are never seeded by a
# migration: a migration runs everywhere, and a known secret must not reach
# production (docs/adr/0008-oidc-clients-registry.md).
#
# Usage: scripts/seed-dev.sh              (reads DATABASE_URL exactly like the app)
#        scripts/seed-dev.sh --dry-run    (prints the resolved arguments, runs nothing)
#        scripts/seed-dev.sh --if-missing (leaves a client that exists as it is)
#
# Development only: it refuses to run with `APP_ENV` set to anything else.
#
# Not idempotent on purpose: a second run fails with "already exists", which
# is the signal that the client is there. There is no update path until the
# admin panel; re-register under another id, or reset the dev database.
# `--if-missing` is the explicit exception, for the entrypoint of the
# development image, which runs this script on every start and has no
# Rust toolchain: there `CAS_CLIENT_BIN` names the binary to run instead of
# `cargo run` (docs/adr/0024-development-image.md).
#
# The secret is the stable development one from the monorepo's
# `.env.development`, passed with `--secret`, a flag that exists in
# development builds alone, so a fresh database and ligretto's checked-in
# development configuration agree without anyone copying a printed value
# (docs/adr/0023-dev-only-client-secret.md). An exported
# `LIGRETTO_CAS_CLIENT_SECRET` wins over the file, as it does for the backend
# that will present it.
#
# Both URIs are the values ligretto-core-backend sends itself, read from the
# same `.env.development`, so the seeded row and the backend cannot differ:
# ligretto-auth's callback (#814), and ligretto-frontend's origin to return to
# after a logout. They are matched byte for byte, so changing one means
# re-registering the client.
#
# The audience is what ligretto's backends expect in the `aud` of an access
# token. It equals the id, and is spelled out because it is a contract with
# those backends rather than a consequence of the client's name
# (docs/adr/0011-token-endpoint-and-access-tokens.md).
set -euo pipefail
cd "$(dirname "$0")/.."

usage() {
  echo "usage: scripts/seed-dev.sh [--dry-run] [--if-missing]" >&2
  exit 2
}

# An extra or unknown argument is refused rather than ignored, so --dry-run
# prints what a real run would register.
dry_run=false
if_missing=false
for arg in "$@"; do
  case "$arg" in
  --dry-run) dry_run=true ;;
  --if-missing) if_missing=true ;;
  *) usage ;;
  esac
done

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
# it. The loop below follows that order. Within one directory it is
# CAS's own order too (src/config/native.rs::load_env_files); the difference
# is that CAS reads the monorepo root alone, while the backend reads its
# package directory first.
#
# The backend reads these values through that loader, so an export, or an
# override written in a .env.development.local of the package or the root,
# reaches the seeded row and the backend alike — the two halves have to agree.
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

redirect_uri=$(env_value LIGRETTO_CORE_AUTH_REDIRECT_URI)
post_logout_redirect_uri=$(env_value LIGRETTO_CORE_AUTH_POST_LOGOUT_REDIRECT_URI)
client_secret=$(env_value LIGRETTO_CAS_CLIENT_SECRET)

args=(
  register
  --id ligretto
  --name Ligretto
  --kind confidential
  --redirect-uri "$redirect_uri"
  --post-logout-redirect-uri "$post_logout_redirect_uri"
  --first-party
  --guest-login-allowed
  --scope openid
  --scope profile
  --scope email
  --audience ligretto
  --secret "$client_secret"
)
if [ "$if_missing" = true ]; then
  args+=(--if-missing)
fi

if [ "$dry_run" = true ]; then
  printf '%s\n' "${args[@]}"
  exit 0
fi

if [ -n "${CAS_CLIENT_BIN-}" ]; then
  "$CAS_CLIENT_BIN" "${args[@]}"
else
  cargo run -p cas --bin cas-client -- "${args[@]}"
fi
