# ligretto-core

The HTTP service of Ligretto on Hono: CAS sign-in through `@memebattle/ligretto-auth`, player profiles, games and
rounds for the gameplay backend. Runs on Node.js and on Cloudflare Workers from the same source.

- `docs/DESIGN.md` — requirements, the directory layout, every route and its contract, the data model, deployment.
- `docs/adrs/` — the decisions that shape the service, one file each. Every file starts with front matter that says
  what was decided and when it matters, enough to tell whether the whole file needs reading. `docs/ADR.md` says how
  to write one; a change that shapes the service gets one.

Commands, from the repository root:

- `pnpm --filter @memebattle/ligretto-core start:dev` — the Node entry under `tsx watch` on port 3333, with the root
  `.env*` files.
- `pnpm --filter @memebattle/ligretto-core dev:worker` — the Worker under `cf dev` on `http://localhost:8787`,
  dispatching on the hostname: `Host: internal.localhost` reaches the internal app.
- `pnpm --filter @memebattle/ligretto-core test` — the unit and HTTP suites, then the Worker smoke suite under
  `workerd`; nothing but Node needed.
- `pnpm --filter @memebattle/ligretto-core ts-check` / `lint`.

The root `pnpm ligretto:start` leaves this package out until the cutover from `ligretto-core-backend`: both serve
port 3333.

Rules that are not negotiable in this package:

- `src/core` imports no `node:*`, no `hono`, no `pg`, no `kysely`, no `cloudflare:*`. Lint enforces it; do not
  add exceptions.
- Routes are declared with schemas through `@hono/zod-openapi`; the OpenAPI documents are generated from them and
  committed.
- Schema changes are migrations, additive, one release ahead of the code that uses them; the row types are
  generated from the migrated schema and committed.
- An expected failure is a result with a stable `error` code, declared on the route. A throw is a bug.
- Comments, documents and commit messages in English.
