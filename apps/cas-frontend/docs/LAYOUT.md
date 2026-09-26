# Layout

Where code lives and how the app is run. The layers are the ones that exist
today; a new one is added when there is something to put in it, not before.

```
apps/cas-frontend/
  AGENTS.md            one-screen card for agents, links into docs/
  docs/                this file, TESTS.md, CODE.md, PASSKEYS.md, ADRs
  index.html           the single page, lang="ru"
  vite.config.ts       React Compiler, Tailwind, the /api dev proxy, vitest
  playwright.config.ts the e2e suite: Chromium, vite as its webServer
  e2e/                 the e2e scenarios (*.e2e.ts) and fixtures.ts, the
                       virtual authenticator over CDP (see TESTS.md)
  src/
    index.tsx          createRoot + RouterProvider, imports app/styles.css
    app/               the shell: router.tsx (routes and the root layout),
                       gates.ts (the session loaders in front of every page),
                       routes.ts (path constants), styles.css (Tailwind entry)
    pages/<page>/      one directory per route, the screen and nothing else;
                       loading/ and error/ are the root route's fallbacks
    entities/<name>/   API calls and types of one domain concept: session
                       (/api/me, /api/logout, the ceremonies), passkey (/api/passkeys)
    entities/<name>/testing/
                       separate testing entry point, fresh builders, domain mocks;
                       private stages only for the owning entity ceremony specs
    shared/testing/    MSW server/setup for specs, browser adapter for Storybook,
                       internal request primitive and injected spy runtime
    shared/api/        request(), ApiError: the wire contract with CAS
    shared/lib/        rules more than one screen applies: label (the name
                       rules CAS applies to a display name and a passkey)
    shared/ui/         the primitives every screen is made of (Button, TextField,
                       Alert, Card, Screen, Icon, Logo), each with a *.stories.tsx
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

Stories run in the root Storybook: `pnpm storybook` from the repo root, under
the "CAS" group. The root `.storybook/preview.tsx` tells this app's stories
apart by path: they skip the MUI theme of the other apps and get
`app/styles.css` from a loader instead, so a story file needs nothing for that.

## The same-origin rule

The app calls the API with relative `/api/...` paths, no base URL and no
`credentials` option. In production infra serves the SPA and the API from one
origin; in development the proxy keeps it that way. The session cookie is
therefore same-origin everywhere and CORS never enters the frontend's code
(ADR 0001 (f)). The API contract itself is described in `apps/cas/README.md`
and the ADRs under `apps/cas/docs/adr`.

Storybook serves its MSW worker from root `.storybook/public/`; production
`public/` and the real-CAS `e2e/` lane contain no mocking runtime. See TESTS.md
for scenario setup, teardown and boundary restrictions.
