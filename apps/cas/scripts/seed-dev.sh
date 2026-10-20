#!/usr/bin/env bash
# Registers the `ligretto` client in the development database, so a fresh
# checkout has one OIDC client out of the box. Clients are never seeded by a
# migration: a migration runs everywhere, and a known secret must not reach
# production (docs/adr/0008-oidc-clients-registry.md).
#
# Usage: scripts/seed-dev.sh             (reads DATABASE_URL exactly like the app)
#        scripts/seed-dev.sh --dry-run   (prints the resolved arguments, runs nothing)
#
# Not idempotent on purpose: a second run fails with "already exists", which
# is the signal that the client is there. There is no update path until the
# admin panel; re-register under another id, or reset the dev database.
#
# The secret is the stable development one from the monorepo's
# `.env.development`, passed with `--secret`, a flag that exists in
# development builds alone. So a fresh database and ligretto's checked-in
# development configuration agree without anyone copying a printed value
# (docs/adr/0023-dev-only-client-secret.md). An exported
# `LIGRETTO_CLIENT_SECRET` wins over the file, as it does for the apps.
#
# The redirect URI is ligretto-auth's callback on ligretto-core-backend
# (#814), on the port the same `.env.development` gives the backend. The
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

dry_run=false
case "${1-}" in
"") ;;
--dry-run) dry_run=true ;;
*)
  echo "usage: scripts/seed-dev.sh [--dry-run]" >&2
  exit 2
  ;;
esac

# The value the apps would see, with the app's own precedence
# (src/config/native.rs::load_env_files): a real environment variable always
# wins, then the monorepo root's .env files, highest priority first. The files
# are never `source`d — that would overwrite an exported value, and the
# seeded row would then disagree with a backend started from the same
# environment. They hold plain unquoted KEY=value lines, so the first matching
# line of the first file that has one is the value.
env_value() {
  local name=$1
  local value
  if value=$(printenv "$name"); then
    printf '%s' "$value"
    return
  fi
  local file line
  for file in ../../.env.development.local ../../.env.development ../../.env.local ../../.env; do
    [ -f "$file" ] || continue
    if line=$(grep -m 1 "^${name}=" "$file"); then
      printf '%s' "${line#*=}"
      return
    fi
  done
  echo "error: $name is set nowhere: export it, or add it to .env.development" >&2
  exit 1
}

core_backend_port=$(env_value LIGRETTO_CORE_BACKEND_PORT)
client_secret=$(env_value LIGRETTO_CLIENT_SECRET)

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
