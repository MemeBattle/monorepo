# Layout

Where code lives and how the app is run. The layers are the ones that exist
today; a new one is added when there is something to put in it, not before.

```
apps/cas-frontend/
  AGENTS.md            one-screen card for agents, links into docs/
  docs/                this file, TESTS.md, CODE.md, ADRs
  index.html           the single page, lang="ru"
  vite.config.ts       React Compiler, Tailwind, the /api dev proxy, vitest
  src/
    index.tsx          createRoot + RouterProvider, imports app/styles.css
    app/               the shell: router.tsx (routes and the root layout),
                       routes.ts (path constants), styles.css (Tailwind entry)
    pages/<page>/      one directory per route, the screen and nothing else
    entities/<name>/   API calls, types and hooks of one domain concept
                       (session, passkey); added with #670 / #671
    shared/api/        request(), ApiError: the wire contract with CAS
    shared/ui/         reusable presentational pieces, once there are two users
```

Imports inside `src` use subpath imports `#…` (see `imports` in
`package.json`): `#pages/sign-in/SignInPage`, `#shared/api/request`.

## Running

All commands run from `apps/cas-frontend`.

- `pnpm start:dev` — vite on :5173. Do not move the port: it is the CAS
  default `CAS_ORIGIN` and the only origin its CORS allows.
- `pnpm build` — production build into `dist/`.

The CAS dev server must be running on :3000 (`bacon run` in `apps/cas`, see
its README): vite proxies `/api` to it. Point `CAS_API_PROXY_TARGET` elsewhere
when CAS listens on another address.

## The same-origin rule

The app calls the API with relative `/api/...` paths, no base URL and no
`credentials` option. In production infra serves the SPA and the API from one
origin; in development the proxy keeps it that way. The session cookie is
therefore same-origin everywhere and CORS never enters the frontend's code
(ADR 0001 (f)). The API contract itself is described in `apps/cas/README.md`
and the ADRs under `apps/cas/docs/adr`.
