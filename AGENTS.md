# memebattle

pnpm monorepo: apps in `apps/*`, shared packages in `packages/*`.

## Commands

From the repo root:

- `pnpm lint:check` / `pnpm lint` — oxlint.
- `pnpm fmt:check` / `pnpm fmt` — oxfmt.
- `pnpm ts-check` — type checking across all packages.
- `pnpm test:ci` — unit tests across all packages.

## Conventions

Read [docs/CODE.md](./docs/CODE.md) before adding or changing any code or documentation.

Read [docs/TESTS.md](./docs/TESTS.md) before adding, changing or deleting a test, and when deciding whether a change needs a test.
