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

Component tests need a DOM: add `jsdom` and `@testing-library/react` (both in
the catalog) together with the first one, and switch that file to the jsdom
environment with a `// @vitest-environment jsdom` comment at its top rather
than making every spec pay for a DOM.

## End-to-end

Not yet. Planned: Playwright with Chromium's virtual authenticator (CDP
`WebAuthn` domain) against a real CAS and Postgres, as a job in
`.github/workflows/cas-frontend-pr.yml`.
