#!/usr/bin/env bash
# The gate of the release workflow, run on the built Worker before the migrations touch anything. Fails when
#   - the output was not built in production mode;
#   - a Hyperdrive id is not a real id, or both bindings carry the same one;
#   - a Hyperdrive configuration cannot be read or has caching enabled: every read of this service is a session read,
#     and Hyperdrive never invalidates on write (docs/adrs/database-access-with-kysely.md);
#   - a secret the Worker declares is not set on it, which includes a Worker that does not exist: the first activation
#     cannot start before its prerequisites are done (README.md § First activation).
# It reads the artefact being uploaded rather than the source, so it cannot check something other than what ships.
# Secret values are never read: the API does not return them.
#
# Usage: check-release.sh [output-dir]   (default: .cloudflare/output)
# Needs `cf` on PATH (run it through `pnpm exec`) with CLOUDFLARE_ACCOUNT_ID and a login or CLOUDFLARE_API_TOKEN, and jq.
set -euo pipefail

output="${1:-.cloudflare/output}"
build_config="$output/v0/config.json"
worker_config="$output/v0/workers/default/worker.config.json"

fail() {
  echo "::error::$*"
  exit 1
}

[[ -f "$build_config" && -f "$worker_config" ]] || fail "no built Worker in $output: run 'pnpm build:worker' first."

mode="$(jq -r '.buildContext.mode // "none"' "$build_config")"
[[ "$mode" == production ]] || fail "$output was built in mode '$mode', not 'production': run 'pnpm build:worker'."

bindings=(HYPERDRIVE_MAIN HYPERDRIVE_LOCKS)
ids=()
for binding in "${bindings[@]}"; do
  id="$(jq -r --arg binding "$binding" '.env[$binding].id // ""' "$worker_config")"
  if ! [[ "$id" =~ ^[0-9a-f]{32}$ ]] || [[ "$id" =~ ^0+$ ]]; then
    fail "$binding has no real Hyperdrive id ('$id'): set it in cloudflare.config.ts."
  fi
  ids+=("$id")
done
[[ "${ids[0]}" != "${ids[1]}" ]] || fail "HYPERDRIVE_MAIN and HYPERDRIVE_LOCKS share the id ${ids[0]}: each needs its own configuration."

for index in "${!bindings[@]}"; do
  binding="${bindings[$index]}"
  if ! configuration="$(cf hyperdrive get "${ids[$index]}")"; then
    fail "$binding: could not read Hyperdrive configuration ${ids[$index]}."
  fi
  disabled="$(jq -r '.caching.disabled // false' <<<"$configuration" 2>/dev/null || true)"
  [[ "$disabled" == true ]] || fail "$binding: Hyperdrive configuration ${ids[$index]} has caching enabled; it must be disabled."
  jq -r --arg binding "$binding" '"\($binding): \(.name), caching disabled, origin_connection_limit \(.origin_connection_limit)"' <<<"$configuration"
done

worker="$(jq -r .name "$worker_config")"
if ! listed="$(cf workers secrets list --worker "$worker")"; then
  fail "could not list the secrets of Worker $worker, which may not exist yet: see README.md § First activation."
fi
set_names="$(jq -r '.[].name' <<<"$listed")"

missing=0
while IFS= read -r secret; do
  [[ -n "$secret" ]] || continue
  if ! grep -qxF -- "$secret" <<<"$set_names"; then
    echo "::error::the secret $secret is not set on Worker $worker: see README.md § First activation."
    missing=1
  fi
done < <(jq -r '.env | to_entries[] | select(.value.type == "secret") | .key' "$worker_config")
((missing == 0)) || exit 1

echo "Both Hyperdrive configurations are cache-disabled and every declared secret is set on $worker."
