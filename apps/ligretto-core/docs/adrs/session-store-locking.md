---
title: Session store locking
description: The `SessionStore` port of ligretto-auth is met with a row lock (`SELECT … FOR UPDATE` on `session_locks`) held in its own transaction on its own connection, while the locked callback's statements commit independently on a second connection. On Node that is two pools; on Workers two per-request clients.
read_when:
  - touching `PgSessionStore`, the sweep or the `session_locks` table
  - changing how database connections are created on any runtime
  - debugging a hung refresh, a "token reuse" sign-out or a pool exhaustion
---

# Session store locking

## Context

CAS rotates refresh tokens and treats a reused one as theft, revoking the grant. Two concurrent `GET /api/auth/me`
calls for one session (two tabs, an expired access token) must not both refresh. `@memebattle/ligretto-auth`
therefore makes the lock part of the `SessionStore` port: `withSessionLock(sessionId, fn)` holds the session
against every other writer, and every read-then-write of a session re-reads inside it
(`packages/ligretto-auth/src/session-store.ts`). This ADR records how that contract is met on Postgres and why it
needs two connections; the design predates the rewrite and is carried over unchanged.

## Decision

- **The lock is a row.** `withSessionLock` opens a transaction, `INSERT … ON CONFLICT DO NOTHING` the id into
  `session_locks`, then `SELECT … FOR UPDATE` it. A concurrent holder blocks the select until it commits. If the
  select finds no row (the sweep deleted it while this transaction waited), the transaction is committed and the
  whole take is retried.
- **The callback writes elsewhere.** `fn` runs while the lock transaction is open, but its own statements go
  through a _different_ connection and commit on their own. A failing `fn` releases the lock without undoing what
  it wrote: `refreshSession` saves the rotated tokens and only then may throw, and rolling that save back would
  make the next refresh a token reuse.
- **Two sources of connections.** A holder occupies its connection for as long as it holds, which includes a round
  trip to CAS. Node therefore has two `pg.Pool`s: `main` for every ordinary statement and `locks` for lock
  transactions only, so waiting holders cannot exhaust the pool the holder's own writes need. On Workers each
  request opens its clients on demand: one for ordinary statements, a second only when it takes a lock, both
  closed in `ctx.waitUntil`. Hyperdrive pools behind both; the exhaustion problem does not exist there because no
  two requests share clients.
- **The sweep** (`src/entry/sweep.ts` on Node, the `scheduled` handler of `src/entry/worker.ts` on Workers: the removal of expired `auth_requests` and of `sessions` past
  the cookie grace) deletes every session under its own lock, for the same reason as above, and leaves a session
  whose lock it cannot take to the next run.

An advisory lock (`pg_advisory_xact_lock`) on one connection was considered: it would still need the second
connection for the independent commits, so it saves nothing and loses the visible row the sweep can reason about.

## Consequences

- Any new writer of `sessions` or `users`-snapshot rows goes through `withSessionLock`; a direct `UPDATE
sessions` outside it is a bug.
- A runtime adapter for the database must be able to hand out two independent connections to one request.
- The store's concurrency tests need two real connections, which is why they run on the Docker Postgres and not
  on PGlite (`testing-strategy.md`).
