# Code

How code is written in this app. Short on purpose: the stack decisions and
their reasons are in `adr/0001-stack.md`.

## Languages

Code, comments, docs and commit messages are English. UI copy comes from
`docs/DESIGN.md` and is a plain string in the component for now; a
translation layer is planned, so no screen should assume a language.

## React Compiler

`@vitejs/plugin-react` runs with `compiler: true`: the Rust React Compiler
(`oxc-transform-react`), no Babel in the pipeline. What that means when
writing components:

- Do not write `useMemo`, `useCallback` or `memo` by hand. The compiler
  memoizes; hand-written memoization it cannot prove correct makes it bail
  out of the whole component.
- Follow the Rules of React: components and hooks are pure, props and state
  are never mutated, hooks are called unconditionally at the top level. The
  compiler skips anything it cannot prove pure, so a violation costs the
  optimization silently.
- `react/react-compiler` in the root `oxlint.config.ts` is enabled for this
  app and reports the violations it can see statically. A clean lint is part
  of the definition of done.

## React 19 idioms

- Forms and mutations use Actions: `<form action={fn}>`, `useActionState`
  for the result and errors of the last submit, `useFormStatus` in the
  submit button, `useOptimistic` for lists that change in place. No form
  library.
- Route data comes from react-router loaders; after a successful mutation the
  route revalidates (`useRevalidator`) rather than patching local state.
- No global state library. Anything on screen comes from the session or the
  route's data.

## API access

- The shapes of every request and response, and the error codes each route
  can answer with, are in CAS's OpenAPI description: `apps/cas/openapi.json`,
  served at `/openapi.json`. kubb generates the client from it
  (`kubb.config.ts`, `adr/0004-generated-api-client.md`): one function per
  `/api/` operation in `#shared/api/generated/operations/<operation>`, and
  the request and response types, types only, in
  `#shared/api/generated/models/`. The generated directory is never edited
  by hand; it is regenerated (see `TESTS.md`).
- Every call goes through a generated function, and every generated function
  calls `client()` from `#shared/api/client`, the only place `fetch` is
  called. It throws `ApiError` with the stable `code` from
  `{ error: { code, message } }`; screens branch on codes, never on messages
  or status numbers. A later interceptor (logging, retries) goes there too.
- Outside `shared/api`, only `entities/<name>/` imports the generated code.
  An entity keeps the domain names as aliases of the generated models
  (`Passkey`, `Me`), narrows the WebAuthn payloads the description leaves as `object` with the
  `@simplewebauthn/browser` types, and, for a function whose failures a
  screen tells apart, exports the union of the codes its operations declare
  (`AddPasskeyErrorCode = ErrorCodeOf<…Responses> | …`).
- A screen narrows with that union: `isApiError<AddPasskeyErrorCode>(error)`.
  `code` is then the declared codes plus `unknown` (a body that could not be
  read), and a comparison or a `case` on a code the operation never answers
  fails the type check.
- Errors reach the user as messages written for the screen; a raw `ApiError`
  or `DOMException` message is never shown. The mapping of what a screen can
  actually get lives in that screen's directory, and a check on an error
  (`isCeremonyCancelled`) next to the code that throws it; the codes a route
  can answer with are the ones its operation lists in the description, which
  the entity's code union carries.
  Nothing about errors is shared until two screens need the same thing.

## Styling

Tailwind utilities in JSX, no CSS modules, no component library. A piece of
UI becomes a component in `shared/ui/` when a second screen needs it.
