#!/usr/bin/env bash
# Registers the OIDC clients the e2e suite uses, in the database the CAS under
# test uses:
#
# - `cas-frontend-e2e`, the client the authorize scenarios send to
#   `/oidc/authorize` (e2e/authorize.e2e.ts). A public first-party client, so
#   a signed-in browser gets a code without a consent screen and no secret is
#   involved.
# - `cas-frontend-e2e-guest`, the client the guest scenarios mint guests with
#   (e2e/guest-upgrade.e2e.ts). Confidential, because only a confidential
#   client may use the guest grant; its secret is written to
#   e2e/.guest-client-secret (gitignored, mode 600), where the suite reads it,
#   and is never printed.
#
# Usage: apps/cas-frontend/e2e/seed.sh   (reads DATABASE_URL exactly like CAS)
#
# Not idempotent, like apps/cas/scripts/seed-dev.sh: each client is attempted
# on its own, so a database seeded before the guest client existed gets it,
# and a second run fails with "already exists", which is the signal that the
# client is there. CAS keeps only a hash of the secret, so a guest client that
# exists without e2e/.guest-client-secret next to it (seeded from another
# checkout) cannot be recovered: delete the client, or use a fresh database,
# and run the script again.
#
# The redirect URI is on a reserved TLD (`.test`, RFC 2606) on purpose: the
# client is not this origin and nothing has to serve it; the tests observe the
# browser's request to it.
set -uo pipefail
e2e_dir="$(cd "$(dirname "$0")" && pwd)"
secret_file="$e2e_dir/.guest-client-secret"
cd "$e2e_dir/../../cas" || exit 1

failed=0

cargo run -p cas --bin cas-client -- register \
  --id cas-frontend-e2e \
  --name "CAS frontend e2e" \
  --kind public \
  --redirect-uri https://client.e2e.test/callback \
  --first-party \
  --scope openid || failed=1

# stdout is the secret's channel (stderr carries the logs and the errors), so
# it is captured whole and only the secret's line goes anywhere: to the file.
if output="$(cargo run -p cas --bin cas-client -- register \
  --id cas-frontend-e2e-guest \
  --name "CAS frontend e2e guest" \
  --kind confidential \
  --redirect-uri https://client.e2e.test/callback \
  --first-party \
  --guest-login-allowed \
  --scope openid)"; then
  secret="$(printf '%s\n' "$output" | sed -n 's/^client_secret: //p')"
  if [ -z "$secret" ]; then
    echo "seed.sh: cas-client printed no client_secret for cas-frontend-e2e-guest" >&2
    failed=1
  else
    (umask 077 && printf '%s' "$secret" > "$secret_file")
    chmod 600 "$secret_file"
    echo "cas-frontend-e2e-guest registered; its secret is in apps/cas-frontend/e2e/.guest-client-secret"
  fi
else
  failed=1
  if [ ! -s "$secret_file" ]; then
    cat >&2 <<'EOF'
seed.sh: cas-frontend-e2e-guest was not registered and e2e/.guest-client-secret is missing.
If the client already exists, its secret cannot be shown again. Remove it and run seed.sh again:
  psql "$DATABASE_URL" -c "DELETE FROM clients WHERE id = 'cas-frontend-e2e-guest'"
or seed a fresh database.
EOF
  fi
fi

exit "$failed"
