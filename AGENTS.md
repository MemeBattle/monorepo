# memebattle

pnpm monorepo: apps in `apps/*`, shared packages in `packages/*`. Per-app instructions live in the app's own `AGENTS.md` (e.g. `apps/ligretto-frontend/AGENTS.md`).

## Commands

From the repo root:

- `pnpm lint:check` / `pnpm lint` — oxlint.
- `pnpm fmt:check` / `pnpm fmt` — oxfmt.
- `pnpm ts-check` — type checking across all packages.
- `pnpm test:ci` — unit tests across all packages.

## Conventions

[docs/guidelines.md](./docs/guidelines.md) applies to every package: language, when to write a code comment, what gets a unit test.
