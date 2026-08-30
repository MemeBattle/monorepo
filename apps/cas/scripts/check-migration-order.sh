#!/usr/bin/env bash
# Fails when a migration added in this PR has a version not greater than the
# newest migration already on master. Merging such a migration would leave it
# permanently pending: sqlx never applies a migration older than one already
# recorded in `_sqlx_migrations`.
#
# Usage: check-migration-order.sh [base-ref]   (default: origin/master)
set -euo pipefail

base_ref="${1:-origin/master}"
migrations_dir="apps/cas/migrations"

version_of() {
  # 20260830161752_baseline.sql -> 20260830161752
  local name
  name="$(basename "$1")"
  printf '%s\n' "${name%%_*}"
}

# Highest migration version already on the base branch.
max_base=0
while IFS= read -r file; do
  version="$(version_of "$file")"
  [[ "$version" =~ ^[0-9]+$ ]] || continue
  if ((10#$version > max_base)); then
    max_base=$((10#$version))
  fi
done < <(git ls-tree -r --name-only "$base_ref" -- "$migrations_dir")

# Migrations added by this PR.
added="$(git diff --name-only --diff-filter=A "$base_ref...HEAD" -- "$migrations_dir")"
if [[ -z "$added" ]]; then
  echo "No new migrations; nothing to check."
  exit 0
fi

status=0
while IFS= read -r file; do
  version="$(version_of "$file")"
  if ! [[ "$version" =~ ^[0-9]+$ ]]; then
    echo "ERROR: $file does not follow the <version>_<name>.sql naming convention."
    status=1
    continue
  fi
  if ((10#$version <= max_base)); then
    echo "ERROR: $file has version $version <= $max_base (the newest migration on $base_ref)."
    echo "       Recreate it with a fresh timestamp: sqlx migrate add <name>."
    status=1
  fi
done <<<"$added"

if ((status == 0)); then
  echo "All new migrations are newer than $base_ref (max version $max_base)."
fi
exit "$status"
