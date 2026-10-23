# 23. A chosen client secret in development builds alone

## Status

Accepted (2026-10-21), with [#811](https://github.com/MemeBattle/monorepo/issues/811).
Resolves what ADR 0008's consequences deferred: ligretto now needs a stable
development secret, so the dev-only `--secret` flag foreseen there exists and
is decided here. Follows ADR 0009 (c): the compile-time gate it puts on the
development signing key, applied to the one door a chosen secret could enter
through. Nothing on the wire and nothing stored changes: no migration, no new
error code, no `openapi.json` change.

## Context

`scripts/seed-dev.sh` gives a fresh development database its `ligretto`
client. Until now the secret of that client was drawn by CAS, printed once and
consumed by nothing: ADR 0008 (b) made `ClientSecret::generate` the only way a
value could reach `secret_hash`, and its consequences said that when ligretto
needed a stable secret the binary could grow a dev-only flag, "and that
decision is recorded then".

That moment is here. `@memebattle/ligretto-auth` exists (#807–#809) and
ligretto-core-backend is about to authenticate to `/oidc/token` with a client
secret from its own configuration (#814). Without a stable value, every reset
of the development database forces an operator to copy a freshly printed
secret into a local configuration file — exactly the step a seed script
exists to remove, and one nobody can perform for a teammate, since the value
differs per machine.

The seed's redirect URIs were placeholders for the same reason: nothing
consumed them either. The callback is now decided — ligretto-auth serves
`/api/auth/callback` on the core backend — and redirect URIs are matched byte
for byte (ADR 0008 (c)), so the registered value has to be the one the backend
will send, not an approximation.

What has to be answered: how a chosen secret can exist at all without
weakening ADR 0008 (b), where the stable value lives, and how the script
resolves it so that the seeded row and the running backend cannot disagree.

## Decision

**(a) `cas-client register --secret <value>` exists in development builds
alone.** `ClientSecret::try_dev` is the only constructor that takes a value,
it is behind `cfg(debug_assertions)`, and the flag's parse arm is a pair of
functions with the same gate: the development body reads the value and
constructs the secret, the release body returns
`UsageError::SecretIsDevelopmentOnly` without reading it. A release build
therefore cannot construct a chosen secret — the type has no such
constructor there — and an operator who tries reads why the flag is gone
rather than that it is unknown, at the usage exit code, before configuration
or the database is touched.

This is ADR 0009 (c) applied to secrets: the development signing key is
`include_str!` behind the same gate, for the same reason, and a runtime check
on `APP_ENV` was rejected there because a release binary would then accept the
weaker input whenever the variable was forgotten. A chosen secret is the same
kind of input.

The invariant that only a confidential client has a secret is held in two
places, as the kind/`secret_hash` pairing itself is (ADR 0008 (b)): the
binary refuses `--secret` with `--kind public` at parse time, and
`register` refuses the same combination with
`RegisterError::SecretForPublicClient`, because the library can be reached
without the binary.

**(b) The stable development secret lives in the monorepo's
`.env.development`, as `LIGRETTO_CAS_CLIENT_SECRET`.** The name is the one
ligretto-core-backend will read (#814); this ADR only puts the value there.
The value is `dev-only-ligretto-secret-public-by-construction`: public by
construction, like `apps/cas/dev/signing-key.pem`, and self-describing so
that a reader or a secret scanner sees at once what it is not. It is
worthless outside a development machine, because the production `ligretto`
client is registered separately with a generated secret (#812).

`seed-dev.sh` resolves the value with the precedence of the loader that will
read it on the other side — ligretto-core-backend's `@adonisjs/env` under
`NODE_ENV=development`, where a real environment variable wins, then
`.env.development.local`, `.env.local`, `.env.development`, `.env`. That is
deliberately not CAS's own order (`config::load_env_files` ranks
`.env.development` above `.env.local`): the seeded row has to match what the
backend presents, so an override a developer writes in `.env.local` must win
on both sides or neither. The files are read line by line rather than
`source`d — sourcing would overwrite an exported value, so a backend started
with `LIGRETTO_CAS_CLIENT_SECRET` in its environment would present one secret
while the seeded row verified another. A `--dry-run` flag prints the resolved
argument list and runs nothing, which is how that precedence is checked
without a database.

Mirroring one loader means seeding one environment: `cas-client` picks its
own `.env` files from `APP_ENV` when it resolves `DATABASE_URL`, so under
another `APP_ENV` the script would write values read from the development
files into another environment's database. It refuses to run with `APP_ENV`
set to anything but `development` — a dev seed has no other use, and a
half-read environment is worse than none.

**(c) ADR 0008 (b)'s invariant now holds exactly for release builds, and by
policy in development.** Only machine entropy can reach `secret_hash` from a
release build; a development build can store a chosen value, which is the
point, and that database is a container with the `cas:cas` default
credentials. Nothing else about storage changes: SHA-256 only, compared in
constant time, shown once, no update or rotate path before the admin panel.

**(d) The seeded URIs stop being placeholders.** The redirect URI is
`http://localhost:<LIGRETTO_CORE_BACKEND_PORT>/api/auth/callback` — the port
from the same `.env.development`, so it has one source of truth, and
`localhost` rather than `127.0.0.1` because the local stack has to be one
host. CAS, the CAS frontend and ligretto-frontend are all on `localhost`;
`@memebattle/ligretto-auth`'s cookies are `__Host-` prefixed and therefore
host-only, so a sign-in begun on `127.0.0.1:3333` would not send its
`__Host-ligretto_auth_state` cookie to a callback on `localhost:3333`, and
the comparison that decides the callback is byte for byte either way. The
monorepo's `LIGRETTO_CORE_URL` — the only checked-in way anything reaches the
backend, and what ligretto-frontend navigates to — was the other host, so
this change moves it to `localhost` too; #814 inherits that host rather than
choosing it. The post-logout URI is
`http://localhost:5174/`, ligretto-frontend's origin in the local SSO stack:
5173 is the CAS frontend's, which is the wrong place to land after a logout.

Nothing in the repository pins ligretto-frontend to a port — its standalone
tooling assumes Vite's default 5173 (`playwright.config.ts`) — so the origin
is made reproducible by a documented launch command rather than by
configuration:

```sh
pnpm --filter @memebattle/ligretto-frontend start:dev --port 5174 --strictPort
```

with no `--` separator. pnpm forwards the flags into the script, so Vite sees
them; a separator would make Vite's parser drop everything after it and bind
5173 by fallback, silently serving an origin the client does not know.
`--strictPort` makes Vite exit instead of drifting to another port, so the
stack either serves exactly the registered origin or fails loudly. The
command is stated wherever the seed is explained (the script's header,
`README.md`, `docs/INTEGRATION.md` §13); a standalone ligretto-frontend keeps
the plain `start:dev` on 5173. Should #816 pin a port in configuration
instead, it replaces the command and costs one re-seed of a reset database.

## Consequences

- A fresh checkout reaches a working local SSO stack with no step that cannot
  be written down: reset the database, run the seed, start the backend with
  the checked-in development configuration. #814 reads
  `LIGRETTO_CAS_CLIENT_SECRET` from the same file the seed resolved it from.
- The crate is compiled in two shapes, so the test suite is too: the tests of
  `try_dev` and of the flag are `cfg(debug_assertions)`, the release
  refusal has its own `cfg(not(debug_assertions))` test, and the registration
  tests supply a secret drawn with `generate()` so they run in either
  profile. `cargo test --release` is what proves the gate still compiles,
  as it already proves it for the signing key (`config/native.rs`).
- `Registration` grows a `secret` field, so every construction site states
  whether it chose one; `None`, the normal case, means CAS draws it.
- The seed is still not idempotent (ADR 0008 (e)): a second run fails with
  "already exists". With a stable secret that failure is now cheap to
  recover from — reset the database and seed again, and every value is the
  same as before.
- The `ligretto` client's development registration is now a contract with
  two sibling tickets: #814 must send that callback byte for byte, and
  whoever changes the backend's port or the frontend's origin re-registers
  the client. Both values are read from `.env.development`, which is where a
  reader will look for them.
