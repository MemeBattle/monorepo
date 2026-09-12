# 1. Frontend stack

## Status

Accepted (2026-09-12), with [#669](https://github.com/MemeBattle/monorepo/issues/669).

## Context

CAS (`apps/cas`) needs a UI of its own: registration and login ceremonies
(ADRs 0001 and 0003), the dashboard behind the session (ADR 0004) and passkey
management (ADR 0006). The repo already has one React SPA,
`apps/ligretto-frontend`, whose conventions — Vite, subpath `#…` imports, root
oxlint and oxfmt, catalog versions — this app follows. What it does not follow
is its runtime stack: ligretto carries Redux, MUI and a shared component
library that a four-screen identity app does not need, and the scaffold is the
moment to decide what this one carries instead.

## Decision

**(a) Vite with the Rust React Compiler.** `@vitejs/plugin-react` runs with
`compiler: true`, backed by `oxc-transform-react`. The compiler memoizes for us,
so components stay free of hand-written `useMemo`/`useCallback`, and the Rust
implementation keeps Babel out of the build entirely — the repo's other tools
(oxlint, oxfmt) are already oxc.

**(b) Tailwind 4 through `@tailwindcss/vite`, and no component library.** The
app is a handful of forms and lists; MUI and `@memebattle/ui` would be a theme
and a dependency graph to carry for that. Tailwind's vite plugin needs no
PostCSS config, and the CSS entry is one `@import "tailwindcss"`.

**(c) `react-router` 8 in data mode.** `createBrowserRouter` + `RouterProvider`
with a root layout route, rather than the `<Routes>` element tree ligretto uses:
loaders and actions are where the auth gate (#670) and the passkey screens
(#671) belong, and they exist only in data mode.

**(d) React 19 Actions for forms and mutations, from #670 on.** `useActionState`
and `useTransition` carry the pending and error state of a WebAuthn ceremony,
so no state library is needed to express "this button is submitting".

**(e) No state library.** Everything on screen comes from the session or a
route's data. Redux, and a server-cache library too, would be machinery around a
single `GET /api/me`; if a real client cache is ever needed, that is its own
decision.

**(f) Same-origin relative API paths, with a dev proxy.** The app calls
`/api/...` with no base URL and no `credentials: 'include'`: in production infra
serves the SPA and the API from one origin, and in development vite proxies
`/api` to the CAS dev server (`CAS_API_PROXY_TARGET`, default
`http://localhost:3000`). The session cookie is then same-origin everywhere,
which is the simplest thing that is also the safest, and CORS never enters the
frontend's code.

**(g) Hand-written API types until CAS publishes an OpenAPI description.** The
surface is small and the generated client would be a build step to maintain;
`src/shared/api` holds a typed `fetch` wrapper and the request/response types by
hand. When the utoipa description exists, the types come from it.

## Consequences

- The dev server stays on vite's default port 5173, which is the CAS default
  `CAS_ORIGIN` and the only origin its CORS allows. Moving it means changing
  CAS's configuration too.
- `oxc-transform-react` is an optional peer of `@vitejs/plugin-react` and so is
  a direct devDependency of this app; an upgrade of the plugin has to keep the
  two in step.
- Every error the API can return reaches the UI as `ApiError` with the stable
  `code` from `{ "error": { "code", "message" } }`, so screens branch on codes
  rather than on messages or status numbers.
- No component library means the app owns its own buttons and inputs. That is
  cheap at this size and would stop being cheap if CAS grew a real product
  surface.
