#!/usr/bin/env bash
# The migration rules of docs/MIGRATIONS.md, checked against the base branch. Fails when the branch
#   - edits, renames or deletes a migration that is on the base branch (immutability);
#   - adds a file to migrations/ that is not named <yyyymmddHHMMSS>_<name>.ts (naming);
#   - adds a migration whose timestamp is not newer than the newest on the base branch (order: Kysely refuses an
#     unordered migration at run time, this says so at review time);
#   - adds a migration with a contract statement (DROP, RENAME, ALTER COLUMN ... TYPE, SET NOT NULL) that no
#     `-- contract:` SQL comment precedes (docs/adrs/additive-migrations-and-compatibility-matrix.md);
#   - adds a migration that writes DDL with Kysely's schema builder (`db.schema`) instead of the `sql` tag, which the
#     contract scan could not read.
# It compares commits (<base>...HEAD), so a staged or uncommitted migration is not checked. Adapted from
# apps/cas/scripts/check-migration-order.sh.
#
# Usage: check-migrations.sh [base-ref]   (default: origin/master)
set -euo pipefail

base_ref="${1:-origin/master}"
cd "$(git rev-parse --show-toplevel)"
migrations_dir="apps/ligretto-core-backend/migrations"

status=0
fail() {
  echo "ERROR: $*"
  status=1
}

# Every change to the folder; --no-renames reports a rename as a deletion plus an addition.
changes="$(git diff --name-status --no-renames "$base_ref...HEAD" -- "$migrations_dir")"
if [[ -z "$changes" ]]; then
  echo "No migration changes against $base_ref."
  exit 0
fi

# Highest timestamp already on the base branch.
max_base=0
while IFS= read -r file; do
  [[ -n "$file" ]] || continue
  name="$(basename "$file")"
  version="${name%%_*}"
  [[ "$version" =~ ^[0-9]{14}$ ]] || continue
  if ((10#$version > max_base)); then
    max_base=$((10#$version))
  fi
done < <(git ls-tree -r --name-only "$base_ref" -- "$migrations_dir")

# A migration's source with its comments removed and its whitespace collapsed, so a statement split over lines is one
# run of words. One left-to-right pass removes three kinds of comment: `/* ... */`, which may span lines; `//` at the
# start of a line or after whitespace (the `//` of a 'https://' literal stays); `--` to the end of its line. The comment
# that starts first runs to its own end, whatever it contains. Each comment becomes a space, except a `--` comment that
# starts with `contract:`, which becomes one marker token. So the marker's own words never count as a statement, a
# marker after its statement on the same line does not lead, and a `-- contract:` inside another comment is not the
# marker.
stripped_source() {
  git show "HEAD:$1" |
    perl -0777 -pe 's{/\*.*?\*/|(?<!\S)//[^\n]*|--[^\n]*}{$& =~ /^--\s*contract:/ ? " __CONTRACT_MARKER__ " : " "}gse' |
    tr -s '[:space:]' ' '
}

# The tokens of a stripped migration that decide the marker rule, in reading order.
contract_tokens() {
  grep -o -i -w -E '__CONTRACT_MARKER__|drop|rename|alter (column )?[^ ]+ (set data )?type|set not null' || true
}

added=()
while IFS=$'\t' read -r change file; do
  [[ -n "$change" ]] || continue
  if [[ "$change" != A ]]; then
    fail "$file is on $base_ref and changed ($change): a migration on $base_ref is never edited, renamed or deleted. Restore it and add a new migration instead."
    continue
  fi
  added+=("$file")
done <<<"$changes"

for file in ${added[@]+"${added[@]}"}; do
  name="${file#"$migrations_dir"/}"
  if ! [[ "$name" =~ ^[0-9]{14}_[a-z0-9_]+\.ts$ ]]; then
    fail "$file does not follow the <yyyymmddHHMMSS>_<name>.ts naming convention; the folder holds migrations and nothing else."
    continue
  fi

  version="${name%%_*}"
  if ((10#$version <= max_base)); then
    fail "$file has timestamp $version <= $max_base (the newest migration on $base_ref). Recreate it with a fresh timestamp: date -u +%Y%m%d%H%M%S."
  fi

  stripped="$(stripped_source "$file")"
  # The contract scan reads SQL; Kysely's schema builder (db.schema.dropTable(...), .setNotNull(), ...) would pass it
  # unread, so DDL stays in the sql tag (docs/MIGRATIONS.md § Adding one).
  if grep -q -E '\. ?schema ?\.' <<<"$stripped"; then
    fail "$file builds DDL with Kysely's schema builder (db.schema). Write the DDL in the sql tag, one statement per execute (docs/MIGRATIONS.md § Adding one)."
  fi

  tokens="$(contract_tokens <<<"$stripped")"
  first="${tokens%%$'\n'*}"
  if [[ -n "$first" && "$first" != __CONTRACT_MARKER__ ]]; then
    fail "$file contains the contract statement '$first' with no leading marker. Put '-- contract: <what it removes and which release stopped using it>' inside the sql tag before the first contract statement (docs/MIGRATIONS.md)."
  fi
done

if ((status == 0)); then
  echo "No migration on $base_ref is edited, renamed or deleted."
  echo "Every added migration is named <yyyymmddHHMMSS>_<name>.ts."
  echo "Every added migration is newer than $base_ref (newest $max_base)."
  echo "No added migration uses Kysely's schema builder."
  echo "Every contract statement in an added migration has a leading -- contract: marker."
fi
exit "$status"
