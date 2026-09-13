# Tests

All commands run from `apps/cas-frontend`; lint and format run from the repo
root.

- `pnpm ts-check` — type checking (tsgo).
- `pnpm test:ci` — unit tests: vitest, `src/**/*.spec.{ts,tsx}`. `pnpm test`
  runs them in watch mode.
- `pnpm lint:check` / `pnpm fmt:check` from the repo root — oxlint and oxfmt,
  configured once for the whole monorepo.

## What gets a unit test

Logic that can be wrong on its own: the API wrapper and error mapping, form
actions, anything that turns an API response into what a screen shows.
Rendering a placeholder or a static route table does not; that is what the
type checker and the build are for.

Component tests render with `@testing-library/react`; vitest runs every spec
in the `jsdom` environment, so a component test needs no per-file setup.

## Stories

Every primitive in `shared/ui` has a story next to it covering its states;
a screen state that is only a composition of primitives is a story too. The
root Storybook picks them up (`pnpm storybook` / `pnpm build-storybook` from
the repo root), Chromatic on the PR gives the visual review, and the a11y
addon runs axe on every story: a story with a violation is a bug in the
primitive, not in the story.

## End-to-end

Not yet. Planned: Playwright with Chromium's virtual authenticator (CDP
`WebAuthn` domain) against a real CAS and Postgres, as a job in
`.github/workflows/cas-frontend-pr.yml`.
