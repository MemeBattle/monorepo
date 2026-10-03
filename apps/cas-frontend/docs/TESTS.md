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

Component tests render with `@testing-library/react` and drive the page with
`@testing-library/user-event`; vitest runs every spec in `jsdom`. The shared
setup starts MSW with `onUnhandledRequest: 'error'`, unmounts components before
resetting handlers and spies after every test, and closes the server after the
suite. An independent request ledger fails teardown even if application code
catches an unanswered request (including silent autofill failures).

## The network boundary

A spec never mocks an entity module and never imports `msw` itself. Keep
`request()` and the CAS wire contract running. Only the entity testing modules
and `shared/testing/` import MSW. The focused `shared/api/request.spec.ts` may
stub fetch to test parsing; `vi.unstubAllGlobals()` restores the intercepted
fetch. Mock `@simplewebauthn/browser` for unit tests; real ceremonies belong in
the separate E2E lane below.

Every requesting entity has two entry points: `#entities/session` (production
calls and types) and `#entities/session/testing` (helpers and builders), likewise
for passkey. Production entry points export nothing test-only. Oxlint limits
testing imports to specs and stories and prevents direct MSW imports there.

Helpers are named `mock` + the API function: `mockGetMe`, `mockLogout`,
`mockUpdateEmail`, `mockListPasskeys`, `mockRenamePasskey`, `mockDeletePasskey`,
`mockRegisterWithPasskey`, `mockSignInWithPasskey`, and `mockAddPasskey`.
Success accepts a partial payload merged onto fresh defaults, preserving
explicit `null`. Lists accept builders such as `mockListPasskeys([aPasskey({
name: 'iPhone' })])`; `aMe()` builds a complete account.

```ts
const rename = mockRenamePasskey({ name: 'iPhone' })
// Drive the page, which calls the real renamePasskey().
await waitFor(() => expect(rename).toHaveBeenCalledWith({ id: 'pk_2', name: 'iPhone' }))
expect(rename).toHaveBeenCalledTimes(1)

mockDeletePasskey.error('last_passkey') // entity owns the status and envelope
mockUpdateEmail.networkError() // real fetch rejection
mockGetMe({ email: 'ada@mems.fun' })
```

Every registration returns a real injected `vi.fn()` in specs and
`storybook/test`'s `fn()` in stories. The spy records flattened parsed path
params and body, or `{}` for a bodyless call. Registering the same endpoint
again replaces its answer and returns a new spy; retain the old spy if asserting
calls made before replacement. Mutating the spy does not change the response.

For delayed or per-request outcomes, `.respond()` takes a typed callback. Return
a payload, `{ error: 'last_passkey' }`, or `{ networkError: true }`, directly or
through a promise. Resolve deferred responses; do not throw API errors from a
responder. This keeps concurrent tests explicit without a fake stateful backend.

```ts
let confirm = () => {}
const save = mockUpdateEmail.respond(
  () =>
    new Promise<void>(resolve => {
      confirm = resolve
    }),
)
// Submit and inspect the optimistic state before confirming.
await waitFor(() => expect(save).toHaveBeenCalledOnce())
mockGetMe({ email: 'ada@mems.fun' }) // answer the coming revalidation
confirm()
```

Ceremony helpers are public composites with no options/verification knobs.
`mockRegisterWithPasskey.error('registration_expired')` fails verification with
CAS's `registration_not_found`; `mockAddPasskey.error('unauthenticated')` fails
before the authenticator. `mockSignInWithPasskey` serves both the button and
autofill. Ceremony spies record the domain input once when options are requested.
Private stage helpers in `testing/stages.ts` exist only for the owning entity's
ceremony specs (for example, challenge refresh), never page specs or stories;
they are not re-exported by the testing entry point. Import the public builders
through the entry point too.

## Stories

Every primitive in `shared/ui` has a story next to it covering its states;
a screen state that is only a composition of primitives is a story too. The
root Storybook picks them up (`pnpm storybook` / `pnpm build-storybook` from
the repo root), Chromatic on the PR gives the visual review, and the a11y
addon runs axe on every story: a story with a violation is a bug in the
primitive, not in the story.

Stories making requests use a meta or story `beforeEach` hook, for example
`beforeEach: () => { mockUpdateEmail() }`. Do not return the spy: Storybook
interprets a returned function as cleanup. The project `beforeEach` awaits MSW
startup and activates the runtime before these hooks run. Its returned cleanup
resets handlers and spies, stops interception, and clears diagnostics on unmount
or rerun. Storybook owns hook ordering; no MSW addon or scenario parameter is
needed. An unanswered request displays a blocking diagnostic even if the
component catches fetch rejection. Storybook assets can still load.

Run `pnpm build-storybook` from the root, then `pnpm test:storybook` from this
app. The separate `playwright.storybook.config.ts` serves the built Storybook
on :6006 and runs Chromium tests; it needs neither CAS nor Postgres. Set
`STORYBOOK_URL` to use an already running server, or
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an existing compatible Chromium.
`STORYBOOK_TEST_OUTPUT` overrides the report/artifact directory (default:
`test-results/storybook`). The tests exercise Email success and failures,
CAS/non-CAS navigation, reruns, and caught unanswered requests. Navigation
awaits Storybook's completion event instead of unrelated component markup.
The `storybook` job in `storybook-pr.yml` builds and runs this lane and uploads
the Playwright report, traces and screenshots on failure, independently of the
real-CAS `e2e` job.

Only the existing Email stories exercise network saving. The worker lives in
root `.storybook/public/mockServiceWorker.js`, served by Storybook's `staticDirs`;
it must never be placed in the production SPA public directory. After upgrading
MSW, regenerate it with `pnpm --filter @memebattle/cas-frontend exec msw init
../../.storybook/public --no-save`. The SPA never imports testing modules.

## End-to-end

`pnpm test:e2e` — Playwright, `e2e/*.e2e.ts`, Chromium only. The suite runs
the real ceremonies against a real CAS and Postgres: nothing is mocked, the
passkeys live on a virtual authenticator that Chromium provides over CDP
(`WebAuthn.enable`, `WebAuthn.addVirtualAuthenticator`). Every test creates
its own account, so the tests run side by side against one CAS and leave
their rows behind; there is no cleanup.

Running it needs CAS up, with its database migrated. The dev database from
`apps/cas/docker-compose.yml` is fine, but the accounts the suite makes pile
up, so a database of its own is better. From the repo root:

```sh
docker compose -f apps/cas/docker-compose.yml up -d
psql postgres://cas:cas@localhost:5434/cas -c 'CREATE DATABASE cas_e2e;'
export DATABASE_URL=postgres://cas:cas@localhost:5434/cas_e2e
cargo run -p cas --bin cas-migrate
cargo run -p cas
```

Then, from `apps/cas-frontend`, `pnpm test:e2e`. Playwright starts vite on
:5173 itself, or reuses the one already there; `CAS_API_PROXY_TARGET` points
the proxy at a CAS on another address, as in development. `CAS_FRONTEND_PORT`
moves vite when 5173 is taken, in which case CAS must be started with
`CAS_ORIGIN` and `CAS_CORS_ORIGINS` set to the new origin, since the
relying-party origin is what the browser signs.

### The fixture

`e2e/fixtures.ts` attaches one virtual authenticator to the page before each
test: a platform authenticator (`transport: 'internal'`) with discoverable
credentials and user verification, which is what CAS asks for, that confirms
every prompt on its own. `authenticators.add()` and `.remove()` stand for
another device: a second passkey for an account is a swap, not an addition,
because a registration with two attached authenticators fails as
`InvalidStateError` as soon as either holds an excluded credential, the same
as with real ones. The `account` fixture creates an account and lands on the
dashboard.

Chromium answers the sign-in screen's autofill offer (conditional mediation)
with the virtual authenticator's discoverable credential as soon as it has
one, without a click: that is how the autofill scenario is driven, and the
test records the `mediation` of every `navigator.credentials.get()` to be
sure it was the offer, not the button, that signed in. The other side of it
is that the button cannot be tested while the offer stands, so the button
scenarios run with the option `autofill: false`, which is a browser without
conditional mediation (`isConditionalMediationAvailable` answers `false`),
the one the button is the fallback for in DESIGN.md.

### In CI

The `e2e` job in `.github/workflows/cas-frontend-pr.yml`: the Postgres
service of `cas-pr.yml`, a debug build of `cas` and `cas-migrate`
(`Swatinem/rust-cache` keeps the target directory between runs), CAS started
in the background with its defaults, Chromium installed by Playwright, vite
started by Playwright's `webServer`. The workflow also runs on `apps/cas/**`
changes, since the suite tests the real backend. On failure the Playwright
report, the traces and CAS's log are uploaded as an artifact.
