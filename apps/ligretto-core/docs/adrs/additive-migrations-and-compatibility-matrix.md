---
title: Additive migrations and the compatibility matrix
description: Every migration keeps both the previous and the next release of the code working; CI type-checks the PR's code against master's schema and master's code against the PR's schema. The order of "migrate" and "deploy" in a release is therefore not fixed.
read_when:
  - writing a migration that changes an existing table
  - removing or renaming a column, or making one NOT NULL
  - changing the CI jobs around the database
  - planning a release that ships a schema change
---

# Additive migrations and the compatibility matrix

## Context

Releases are not atomic: during a rollout two versions of the code serve at once, and the migration may run
before or after the new code starts depending on the deployment target. A schema change therefore has to be
compatible with the code on either side of it. CAS states the same rule (`apps/cas/docs/MIGRATIONS.md`,
expand/contract) and checks its queries against the live schema; here the generated row types make the check
mechanical in both directions.

## Decision

**Policy.** Expand, then contract, across releases:

1. A migration adds: tables, nullable columns, columns with a `DEFAULT`, indexes (`CONCURRENTLY` where the table
   is live).
2. Code starts using the new shape only in the release _after_ the migration that created it.
3. Code stops using the old shape; the release _after_ that may ship the migration that removes it.
4. A rename is add + backfill + switch + drop, never `ALTER … RENAME`. `SET NOT NULL` ships only after a backfill
   and with a `DEFAULT`, or not at all.

A migration that drops, renames or tightens a column carries a leading comment `-- contract: <what it removes and
which release stopped using it>`. A CI script fails a PR whose migration contains `DROP`, `RENAME`,
`ALTER COLUMN … TYPE` or `SET NOT NULL` without that marker.

**Matrix.** Three CI jobs, each with its own Postgres service, each ending in `tsc --noEmit`:

| Job               | Migrations applied | Code type-checked                             | Window it guards                                                               |
| ----------------- | ------------------ | --------------------------------------------- | ------------------------------------------------------------------------------ |
| `schema-current`  | PR                 | PR                                            | the ordinary check; also regenerates `schema.generated.ts` and fails on a diff |
| `schema-previous` | master             | PR                                            | new code started before the migration ran                                      |
| `code-previous`   | PR                 | master, checked out into a separate directory | old code still running after the migration, or a rollback of the code          |

Each job: apply the chosen migrations with `pnpm migrate`, run `kysely-codegen` into the chosen tree, type-check
that tree. The row types are the only input the matrix needs, which is why they are generated rather than written
(`database-access-with-kysely.md`).

**Immutability and order.** A second script fails a PR that modifies or deletes a migration file present on
master, or adds one whose timestamp is older than the newest on master (Kysely would refuse it at run time; the
script says so at review time). Both scripts are adapted from `apps/cas/scripts/check-migration-order.sh`.

**Release order.** Not fixed. The matrix makes both orders safe, so the release workflow of each target runs the
migration entry wherever is convenient for it.

## Consequences

- A column cannot be added and used in the same PR. The PR that uses it is the next one; the matrix enforces this
  rather than a reviewer remembering it.
- What the matrix cannot see: `CHECK` and `UNIQUE` constraints, data semantics (old code writing a value new code
  interprets differently), behaviour of defaults. Those stay with review and the store tests.
- Every schema change costs two or three small PRs instead of one. At this service's rate of schema change (nine
  migrations in five years) that is the right trade.
