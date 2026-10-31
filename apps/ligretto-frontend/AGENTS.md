# ligretto-frontend

React + Vite SPA (package `@memebattle/ligretto-frontend`). Imports inside `src` use subpath imports `#…` (see `imports` in package.json).

[docs/TESTS.md](./docs/TESTS.md) says how to run the checks and what gets a unit test in this package: screens are tested from the user's point of view, store listeners get no unit test.

The ligretto-core API is called only through `@memebattle/ligretto-core-client`, in `src/shared/api`. Its base, the root `LIGRETTO_CORE_URL`, is an origin without `/api`, because the generated paths start with `/api`. It is set only in development and tests: in production it stays unset, and the SPA calls the API on its own origin.

## Build and release

`pnpm build:worker` runs `vite build`, then `cf-wrangler build --mode production`, into `.cloudflare/output`: the SPA as an
assets-only Worker, `ligretto-frontend`, on the route `ligretto.app/*` (`cloudflare.config.ts`, `wrangler.config.ts`). It
has no Worker code, bindings or secrets. Not `cf build`: in this package it detects Vite and delegates to `vite build`,
which writes no Build Output. The SPA's build values come from the root `.env` / `.env.production`; the Worker's
production values are in `cloudflare.config.ts`. `.github/workflows/ligretto-release.yml` releases it last, after
ligretto-core-backend, so a new SPA never meets an old API. `.github/workflows/ligretto-frontend-pr.yml` runs `ts-check`,
`test:ci` and `build:worker` on every pull request that touches this package or the workspace packages it is built from.
Development keeps the vite dev server.
