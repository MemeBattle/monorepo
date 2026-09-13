# 2. Ceremony state in Postgres

## Status

Accepted (2026-09-06), with [#665](https://github.com/MemeBattle/monorepo/issues/665).

## Context

A WebAuthn ceremony spans two requests: the server issues a challenge, the
browser answers it. Between the two the server must remember the challenge
state, use it exactly once, and forget it if the user walks away.

CAS is deployed to Kubernetes as several replicas that scale automatically,
so the two requests of one ceremony may reach different instances. The
service must be stateless: nothing a later request depends on may live in a
process's memory.

webauthn-rs only lets its ceremony state be serialised with the
`danger-allow-state-serialisation` feature. Its documentation is explicit
about what the danger is: state handed to the *client* (a cookie) can be
replayed without the authenticator. "Serialising to a database, or using a
cookie 'memory store' where the client side cookie is a key into a
server-side map" is listed as a safe case.

## Decision

**(a) Ceremony state lives in the `webauthn_ceremonies` table, never in
memory.** The row holds the serde form of the library state plus what CAS
needs to finish (for a registration: the future account id and the display
name) as jsonb, with `kind` and `expires_at`.

**(b) A ceremony is keyed by its own random id, not by the account id.** The
same account will run several ceremonies at once (a second passkey, two open
tabs), and a login ceremony has no account when it starts. The account id
travels inside the challenge as the WebAuthn user handle and is revealed by
the finish response only.

**(c) Finishing is one transaction.** It deletes the ceremony row, verifies
the answer, and writes the account and the credential. A failed verification
commits the deletion: the challenge was answered, wrongly, and must not be
answered again. A failed write rolls everything back, so the ceremony survives
and the client can retry — the authenticator has already created the
credential by then, and a retry is the only way not to orphan it.

**(d) Expiry is measured by the database clock**, with a 30 second grace
period over the timeout sent to the browser. Every replica agrees on the
clock, and the browser, which starts counting later than the server, is never
the one that is still waiting when the server has given up. Expired rows are
ignored by the finish and are not removed by the application: cleanup is kept
out of the request path and becomes a separate scheduled job (a k8s CronJob
running the delete, or pg_cron).

## Consequences

- Any replica can finish any ceremony, and a pod restart loses nothing.
- Every ceremony costs two writes. At CAS's scale that is not a concern; a
  ceremony table is also what login (#666) reuses, with `kind =
  'authentication'`.
- The serde shape of `PasskeyRegistration` is now stored. A change to it in
  webauthn-rs only affects rows younger than a few minutes, so no migration is
  needed: the old rows expire. A row that no longer deserialises is discarded —
  the take deletes it and the finish commits that deletion — and the client gets
  `registration_not_found` and restarts the ceremony. It is a rollout condition,
  not a server fault, so it is never a 500 and it never survives to fail the
  next retry.
- Until the scheduled cleanup exists, the table grows by one row (~500 bytes)
  per abandoned ceremony. At CAS's scale that is acceptable; the index on
  `expires_at` is there for the cleanup to use.
- The unauthenticated `/register-options` can write rows at will, and nothing
  in the request path bounds them. Rate limiting is the deployment's job
  (ingress), not the application's.
