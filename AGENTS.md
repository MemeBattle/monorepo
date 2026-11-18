# memebattle

pnpm monorepo: apps in `apps/*`, shared packages in `packages/*`.

## Commands

From the repo root:

- `pnpm lint:check` / `pnpm lint` — oxlint.
- `pnpm fmt:check` / `pnpm fmt` — oxfmt.
- `pnpm ts-check` — type checking across all packages.
- `pnpm test:ci` — unit tests across all packages.

## Conventions

Code comments, agent docs (`AGENTS.md`, `docs/`) and commit messages are English.

Read [docs/CODE.md](./docs/CODE.md) before adding or changing any code or documentation.

Read [docs/TESTS.md](./docs/TESTS.md) before adding, changing or deleting a test, and when deciding whether a change needs a test.

Read [docs/naming-convention.md](./docs/naming-convention.md) before creating or renaming a React component, its file, its directory or its stories file.
