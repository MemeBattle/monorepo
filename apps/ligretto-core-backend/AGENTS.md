# ligretto-core-backend

The HTTP service of Ligretto on Hono: CAS sign-in through `@memebattle/ligretto-auth`, player profiles, games and
rounds for the gameplay backend. Runs on Node.js and on Cloudflare Workers from the same source.

- `docs/DESIGN.md` — requirements, the directory layout, every route and its contract, the data model, deployment.
- `docs/MIGRATIONS.md` — adding a migration, applying it, regenerating the row types, the immutability rule, the
  compatibility window and what CI checks.
- `docs/adrs/` — the decisions that shape the service, one file each. Every file starts with front matter that says
  what was decided and when it matters, enough to tell whether the whole file needs reading. `docs/ADR.md` says how
  to write one; a change that shapes the service gets one.

Rules that are not negotiable in this package:

- `src/core` imports no `node:*`, no `hono`, no `pg`, no `kysely`, no `cloudflare:*`. Lint enforces it; do not
  add exceptions.
- Routes are declared with schemas through `@hono/zod-openapi`; the OpenAPI documents are generated from them and
  committed.
- Schema changes are migrations, additive, one release ahead of the code that uses them; the row types are
  generated from the migrated schema and committed.
- An expected failure is a result with a stable `error` code, declared on the route. A throw is a bug.
- Comments, documents and commit messages in English.
