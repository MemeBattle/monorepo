---
title: Session store locking
description: >-
  The SessionStore port of ligretto-auth is met with a row lock (SELECT … FOR UPDATE on session_locks) held in its
  own transaction on its own connection, bounded by lock_timeout, while the locked callback's statements commit
  independently on a second connection. On Node that is two pools; on Workers two per-request clients on two
  Hyperdrive configurations.
read_when:
  - touching the session store, the sweep or the session_locks table
  - writing anything that updates a sessions row or the users snapshot
  - changing how database connections are created on any runtime
  - debugging a hung refresh, a "token reuse" sign-out or a pool exhaustion
---

# Session store locking

## Context

CAS rotates refresh tokens and treats a reused one as theft, revoking the grant. Two concurrent `GET /api/auth/me`
calls for one session (two tabs, an expired access token) must not both refresh. `@memebattle/ligretto-auth`
therefore makes the lock part of the `SessionStore` port: every read-then-write of an _existing_ session runs
inside `withSessionLock` on that session's id and re-reads the session inside it; a brand-new session with a fresh,
unguessable id may be saved without a lock (`packages/ligretto-auth/src/session-store.ts`, `sessions.ts`). This ADR
records how that contract is met on Postgres and why it needs two connections; the design is carried over from the
previous service (`apps/ligretto-core-backend/app/stores/PgSessionStore.ts`) unchanged in substance.

## Decision

- **The lock is a row.** `withSessionLock` opens a transaction on the lock connection, runs `SET LOCAL lock_timeout`
  (ten seconds unless configured) first — the `INSERT` below can block on a concurrent insert of the same id, not
  only the select — then `INSERT … ON CONFLICT DO NOTHING` of the id into `session_locks`, then `SELECT … FOR UPDATE`
  on it. A concurrent holder blocks the select until it commits. If the select finds no row
  (the sweep deleted it while this transaction waited), the transaction is committed and the whole take is
  retried, at most a few times and within one overall deadline for the whole take (`lock_timeout` bounds each
  acquisition separately, not the loop). A `lock_timeout` expiry or an exhausted deadline surfaces as
  `503 session_busy`, never as a 500: the request can be repeated.
- **The callback writes elsewhere.** `fn` runs while the lock transaction is open, but its own statements go
  through the _main_ connection and commit on their own. A failing `fn` releases the lock without undoing what it
  wrote: `refreshSession` saves the rotated tokens and only then may throw, and rolling that save back would make
  the next refresh a token reuse. `saveSession` itself is one transaction on the main connection — the `users`
  snapshot upsert and the `sessions` upsert commit together or not at all — and it never takes the lock itself:
  the lock belongs to the caller that decided, so a fresh session can be saved without one and an existing one is
  saved under the lock the caller already holds.
- **Two sources of connections.** A holder occupies its connection for as long as it holds, which includes a round
  trip to CAS. Node therefore has two `pg.Pool`s, `main` and `locks`, so waiting holders cannot exhaust the pool the
  holder's own writes need. On Workers the same split is two cache-disabled Hyperdrive configurations,
  `HYPERDRIVE_MAIN` and `HYPERDRIVE_LOCKS`: Hyperdrive pools origin connections across requests, so per-request
  clients alone would not isolate lock waiters from ordinary traffic. Hyperdrive's limits are soft, so the two
  configurations are budgeted together against the Neon plan's connection limit with headroom for every other
  client, and #836 ships a saturation test: a holder must still be able to persist rotated tokens while lock
  traffic is saturated. Every wait inside the lock is bounded: the
  `lock_timeout` above and a request timeout on the CAS client (`createCasClient`'s `requestTimeoutMs`, opt-in,
  covering the response body; this service sets it).
- **The sweep** (`src/entry/sweep.ts` on Node, the `scheduled` handler of `src/entry/worker.ts` on Workers)
  removes `auth_requests` with `expires_at <= now` and `sessions` with `grant_ends_at <= now − SESSION_COOKIE_GRACE_MS`.
  Each session goes under its own lock, the predicate is re-checked inside the lock, and the lock row is deleted
  in the holding transaction; orphan lock rows are collected afterwards with `SKIP LOCKED`. A session whose lock
  the run cannot take within `lock_timeout` is counted, reported and left to the next run. This is the current
  `sweepExpiredAuth.ts`, statement for statement.

An advisory lock (`pg_advisory_xact_lock`) on one connection was considered: it would still need the second
connection for the independent commits, so it saves nothing and loses the visible row the sweep can reason about.

## Consequences

- Any code that updates an existing `sessions` row goes through `withSessionLock` held by the caller; an `UPDATE
sessions` outside it is a bug. Inserting a fresh session is not subject to that rule. The `users` snapshot is
  written only through `saveSession`, so it is as serialised as the sessions that carry it, no more: two sessions
  of one user may update the snapshot under different locks, last write wins, which is the port's contract.
- A runtime adapter for the database must be able to hand out two independent connections to one request, from
  two separately bounded sources.
- The store's tests need two real connections, which is why they run on the Docker Postgres and not on PGlite
  (`testing-strategy.md`).

upd (2026-10-24): createCasClient gained the requestTimeoutMs option (#835); the body names it instead of the to-do.
