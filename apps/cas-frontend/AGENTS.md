# cas-frontend

React + Vite SPA for CAS, the passkey identity provider in `apps/cas` (package
`@memebattle/cas-frontend`). It is the sign-in, account creation and passkey
management UI; the API contract it speaks to is described in `apps/cas/README.md`
and the ADRs under `apps/cas/docs/adr`. The stack decisions are in
`docs/adr/0001-stack.md`.

Imports inside `src` use subpath imports `#…` (see `imports` in package.json).
UI copy is Russian; code, comments and docs are English.

## How to run

All commands run from `apps/cas-frontend`:

- `pnpm start:dev` — vite on :5173, which is the CAS default `CAS_ORIGIN` and
  the only origin its CORS allows, so do not move the port. The CAS dev server
  must be running on :3000: vite proxies `/api` to it. Point
  `CAS_API_PROXY_TARGET` elsewhere when it listens on another address.
- `pnpm build` — production build.

The app calls the API with relative `/api/...` paths and no `credentials`
option: in production infra serves the SPA and the API from one origin, and in
development the proxy keeps it that way, so the session cookie is same-origin
either way.

## How to test (for agents too)

- `pnpm ts-check` — type checking (tsgo).
- `pnpm test:ci` — unit tests (vitest + jsdom, `src/**/*.spec.{ts,tsx}`).

Lint and format come from the repo root: `pnpm lint:check` and `pnpm fmt:check`.

## React Compiler

`@vitejs/plugin-react` runs with `compiler: true`, which is the Rust React
Compiler (`oxc-transform-react`) — no Babel anywhere in the pipeline. What it
means when writing components:

- Do not write `useMemo`, `useCallback` or `memo` by hand. The compiler memoizes
  for you, and hand-written memoization it cannot prove correct makes it bail
  out of the component.
- Follow the Rules of React: components and hooks stay pure, props and state are
  never mutated, hooks are called unconditionally at the top level. The compiler
  skips anything it cannot prove pure, so a violation costs the optimization
  quietly.
- `react/react-compiler` in the root `oxlint.config.ts` is enabled for this app
  and reports the violations it can see statically.
