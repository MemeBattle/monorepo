#!/usr/bin/env bash
# Registers `ligretto-auth-test`, the OIDC client the integration suite drives
# CAS as, in the database the CAS under test uses. Confidential, because the
# suite mints guests with the guest grant and redeems codes with a secret;
# first-party, so a signed-in browser gets a code without a consent screen.
#
# Usage: packages/ligretto-auth/tests/integration/seed.sh
#        (reads DATABASE_URL exactly like CAS)
#
# Clients are never seeded by a migration: a migration runs everywhere, and a
# known secret must not reach production (apps/cas/docs/adr/0008-oidc-clients-registry.md).
#
# Not idempotent, like apps/cas/scripts/seed-dev.sh and
# apps/cas-frontend/e2e/seed.sh: a second run fails with "already exists",
# which is the signal that the client is there. CAS keeps only a hash of the
# secret, so a client that exists without .client-secret next to it (seeded
# from another checkout) cannot be recovered: delete the client, or use a
# fresh database, and run the script again.
#
# The redirect URIs are on a reserved TLD (`.test`, RFC 2606) on purpose, as
# in apps/cas-frontend/e2e/seed.sh: nothing has to serve that origin. CAS
# redirects the test's browser there, the suite asserts the Location is on it,
# and then delivers that one navigation to the local HTTP server the handlers
# are mounted on — the DNS mapping a deployment would have.
#
# The audience equals the id and is spelled out, because it is the contract
# the suite's `verifyAccessToken` call checks `aud` against rather than a
# consequence of the client's name
# (apps/cas/docs/adr/0011-token-endpoint-and-access-tokens.md).
set -uo pipefail
integration_dir="$(cd "$(dirname "$0")" && pwd)"
secret_file="$integration_dir/.client-secret"
cd "$integration_dir/../../../../apps/cas" || exit 1

# stdout is the secret's channel (stderr carries the logs and the errors), so
# it is captured whole and only the secret's line goes anywhere: to the file.
if output="$(cargo run -p cas --bin cas-client -- register \
  --id ligretto-auth-test \
  --name "ligretto-auth integration" \
  --kind confidential \
  --redirect-uri https://ligretto-auth.test/auth/callback \
  --post-logout-redirect-uri https://ligretto-auth.test/ \
  --first-party \
  --guest-login-allowed \
  --scope openid \
  --scope profile \
  --scope email \
  --audience ligretto-auth-test)"; then
  secret="$(printf '%s\n' "$output" | sed -n 's/^client_secret: //p')"
  if [ -z "$secret" ]; then
    echo "seed.sh: cas-client printed no client_secret for ligretto-auth-test" >&2
    exit 1
  fi
  (umask 077 && printf '%s' "$secret" > "$secret_file")
  chmod 600 "$secret_file"
  echo "ligretto-auth-test registered; its secret is in packages/ligretto-auth/tests/integration/.client-secret"
  exit 0
fi

if [ -s "$secret_file" ]; then
  echo "seed.sh: ligretto-auth-test is already registered and its secret is in .client-secret; nothing to do." >&2
  exit 0
fi

cat >&2 <<'EOF'
seed.sh: ligretto-auth-test was not registered and tests/integration/.client-secret is missing.
If the client already exists, its secret cannot be shown again. Remove it and run seed.sh again:
  psql "$DATABASE_URL" -c "DELETE FROM clients WHERE id = 'ligretto-auth-test'"
or seed a fresh database.
EOF
exit 1
