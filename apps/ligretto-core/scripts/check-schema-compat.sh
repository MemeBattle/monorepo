#!/usr/bin/env bash
# One cell of the compatibility matrix of docs/adrs/additive-migrations-and-compatibility-matrix.md: applies the
# migrations of one tree to DATABASE_URL, regenerates the row types of another tree from that schema and
# type-checks it; with --store, also runs that tree's store suite on the same migration set.
#
# A tree is a repository root: `.` for the checkout of the pull request, `previous` for the base branch's. The
# migration tree only needs apps/ligretto-core/migrations; the code tree needs its dependencies installed. When the
# two differ, the chosen migrations folder is swapped into the code tree, so that tree's own migrate entry, codegen
# entry and store suite run on it, and the code tree's folder is restored on exit, success or failure. The
# regenerated schema.generated.ts is left in place: schema-current diffs it, a local run restores it with git.
#
# DATABASE_URL must name an empty database, or one migrated by the same set: Kysely refuses a database that
# recorded a migration the tree lacks. --store also needs LIGRETTO_CORE_TEST_DATABASE_URL, which the suite wipes.
#
# Usage: check-schema-compat.sh --migrations <tree> --code <tree> [--store]
set -euo pipefail

usage() {
  echo "Usage: $0 --migrations <tree> --code <tree> [--store]" >&2
  echo "       DATABASE_URL is required; --store also requires LIGRETTO_CORE_TEST_DATABASE_URL." >&2
  exit 2
}

migrations_tree=""
code_tree=""
store=0
while (($# > 0)); do
  case "$1" in
    --migrations)
      (($# >= 2)) || usage
      migrations_tree="$2"
      shift 2
      ;;
    --code)
      (($# >= 2)) || usage
      code_tree="$2"
      shift 2
      ;;
    --store)
      store=1
      shift
      ;;
    *) usage ;;
  esac
done

[[ -n "$migrations_tree" && -n "$code_tree" ]] || usage
[[ -n "${DATABASE_URL:-}" ]] || usage
if ((store == 1)); then
  [[ -n "${LIGRETTO_CORE_TEST_DATABASE_URL:-}" ]] || usage
fi

package="apps/ligretto-core"
source_migrations="$(cd "$migrations_tree" && pwd -P)/$package/migrations"
code_package="$(cd "$code_tree" && pwd -P)/$package"
code_migrations="$code_package/migrations"

[[ -d "$source_migrations" ]] || {
  echo "ERROR: $source_migrations does not exist." >&2
  exit 2
}
[[ -f "$code_package/package.json" ]] || {
  echo "ERROR: $code_package/package.json does not exist." >&2
  exit 2
}

step() {
  echo "==> $*"
}

if [[ "$source_migrations" != "$code_migrations" ]]; then
  backup="$(mktemp -d)"
  step "Swapping $source_migrations into $code_migrations (the original is kept in $backup until exit)"
  cp -R "$code_migrations" "$backup/migrations"

  restored=0
  restore() {
    ((restored == 0)) || return 0
    restored=1
    rm -rf "$code_migrations"
    mv "$backup/migrations" "$code_migrations"
    rmdir "$backup"
    echo "==> Restored $code_migrations"
  }
  trap restore EXIT
  # A signal becomes an exit, so the EXIT trap restores the folder on Ctrl-C too.
  trap 'exit 130' INT
  trap 'exit 143' TERM

  rm -rf "$code_migrations"
  cp -R "$source_migrations" "$code_migrations"
fi

step "Migrating DATABASE_URL with the migrations of $migrations_tree"
pnpm --dir "$code_package" run migrate

step "Regenerating the row types of $code_tree"
pnpm --dir "$code_package" run db:codegen

step "Type-checking $code_tree against that schema"
pnpm --dir "$code_package" run ts-check

if ((store == 1)); then
  step "Running the store suite of $code_tree on that migration set"
  pnpm --dir "$code_package" run test:store:run
fi
