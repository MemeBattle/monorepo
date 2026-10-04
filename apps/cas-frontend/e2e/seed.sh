#!/usr/bin/env bash
# Registers the OIDC client the e2e suite sends to `/oidc/authorize`
# (e2e/authorize.e2e.ts), in the database the CAS under test uses.
#
# Usage: apps/cas-frontend/e2e/seed.sh   (reads DATABASE_URL exactly like CAS)
#
# Not idempotent, like apps/cas/scripts/seed-dev.sh: a second run fails with
# "already exists", which is the signal that the client is there.
#
# A public first-party client, so a signed-in browser gets a code without a
# consent screen and no secret is involved. The redirect URI is on a reserved
# TLD (`.test`, RFC 2606) on purpose: the client is not this origin and nothing
# has to serve it; the tests observe the browser's request to it.
set -euo pipefail
cd "$(dirname "$0")/../../cas"

cargo run -p cas --bin cas-client -- register \
  --id cas-frontend-e2e \
  --name "CAS frontend e2e" \
  --kind public \
  --redirect-uri https://client.e2e.test/callback \
  --first-party \
  --scope openid
