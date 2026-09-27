#!/usr/bin/env bash
# Registers the `ligretto` client in the development database, so a fresh
# checkout has one OIDC client out of the box. Clients are never seeded by a
# migration: a migration runs everywhere, and a known secret must not reach
# production (docs/adr/0008-oidc-clients-registry.md).
#
# Usage: scripts/seed-dev.sh        (reads DATABASE_URL exactly like the app)
#
# Not idempotent on purpose: a second run fails with "already exists", which
# is the signal that the client is there. There is no update path until the
# admin panel; re-register under another id, or reset the dev database.
#
# The secret is printed once, by the binary, and cannot be shown again.
# Nothing consumes it yet, so a fresh one on every seeded database is fine;
# when ligretto is wired to CAS it will need a stable dev secret, and the
# binary can grow a dev-only flag for it then.
#
# The redirect URIs are placeholders: ligretto-frontend runs on Vite's default
# port, and the real callback path is decided by the "Ligretto on CAS"
# milestone of the SSO epic (#548). Changing them means re-registering.
#
# The audience is what ligretto's backends expect in the `aud` of an access
# token. It equals the id, and is spelled out because it is a contract with
# those backends rather than a consequence of the client's name
# (docs/adr/0011-token-endpoint-and-access-tokens.md).
set -euo pipefail
cd "$(dirname "$0")/.."

cargo run -p cas --bin cas-client -- register \
  --id ligretto \
  --name Ligretto \
  --kind confidential \
  --redirect-uri http://localhost:5173/oidc/callback \
  --post-logout-redirect-uri http://localhost:5173/ \
  --first-party \
  --guest-login-allowed \
  --scope openid \
  --scope profile \
  --scope email \
  --audience ligretto
