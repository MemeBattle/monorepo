/**
 * The `SessionStore` of `@memebattle/ligretto-auth` over this application's own Postgres
 * (docs/adrs/session-store-locking.md).
 *
 * The port states the contract (`packages/ligretto-auth/src/session-store.ts`); what is decided here is how it is
 * met on a database: the lock is a row in `session_locks` taken with `SELECT … FOR UPDATE` inside a transaction on
 * the `locks` handle, which also works over Hyperdrive's per-request connection, and every session write carries the
 * profile snapshot into `users` in the same transaction on the `main` handle.
 */

import type { PendingAuthorizationRequest, Session, SessionStore } from '@memebattle/ligretto-auth'
import { sql } from 'kysely'
import type { Selectable, Transaction } from 'kysely'

import type { Clock } from '../../core/ports/clock'
import { SessionBusyError } from '../../core/ports/session-store'
import type { UserProfile } from '../../core/ports/users-repository'
import { systemClock } from '../system-clock'
import type { Database, DatabaseHandles } from './database'
import type { AuthRequests, DB, Sessions } from './schema.generated'
import { toAccountType, upsertUser } from './users-repository'

/** How long a take of a session's lock may wait, and how often it retries a vanished row. */
export interface SessionLockOptions {
  /**
   * The time source of the deadline. Wall clock by default; a test passes a fake to move the deadline without
   * waiting. The backstop timer is always real time. Separate from the store's own clock (row expiry), so a fixed
   * test clock is never handed to the lock by accident.
   */
  clock?: Clock
  /** The most any one lock statement may wait, in ms; capped by the budget left when the statement starts. */
  lockTimeoutMs?: number
  /** How many takes may find their row gone (the sweep deleted it) before the take gives up. */
  maxAttempts?: number
  /** One budget for the whole take, in ms, the wait for a `locks` connection included. */
  deadlineMs?: number
}

const DEFAULT_LOCK_TIMEOUT_MS = 10_000
const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_DEADLINE_MS = 15_000

type LockSettings = Required<SessionLockOptions>

/**
 * The largest bound the mechanism can honour: `setTimeout` clamps a longer delay to 1 ms, which would expire every
 * take at once, and Postgres refuses a `lock_timeout` above it.
 */
const MAX_BOUND = 2_147_483_647

const positiveInteger = (name: string, value: number): number => {
  // The timeout is rendered into the SQL as a literal and arms a timer; anything the mechanism cannot honour is a
  // programming mistake, refused here rather than on the first take.
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_BOUND) {
    throw new Error(`${name} must be a positive integer no greater than ${MAX_BOUND}, got ${value}`)
  }
  return value
}

/** The options with their defaults, refused when a bound is not a positive integer up to `MAX_BOUND`. */
export const lockSettingsOf = (options: SessionLockOptions = {}): LockSettings => ({
  clock: options.clock ?? systemClock,
  lockTimeoutMs: positiveInteger('lockTimeoutMs', options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS),
  maxAttempts: positiveInteger('maxAttempts', options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS),
  deadlineMs: positiveInteger('deadlineMs', options.deadlineMs ?? DEFAULT_DEADLINE_MS),
})

const sessionOf = (row: Selectable<Sessions>): Session => ({
  id: row.id,
  sub: row.sub,
  accountType: toAccountType(row.account_type),
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  refreshToken: row.refresh_token,
  accessToken: row.access_token,
  // bigint: `pg` hands these over as strings; the port speaks numbers.
  accessTokenExpiresAt: Number(row.access_token_expires_at),
  grantEndsAt: Number(row.grant_ends_at),
  idToken: row.id_token,
  createdAt: Number(row.grant_started_at),
})

/** Every column but the key, which is what an upsert moves on. */
const columnsOf = (session: Session) => ({
  sub: session.sub,
  account_type: session.accountType,
  display_name: session.displayName,
  avatar_url: session.avatarUrl,
  refresh_token: session.refreshToken,
  access_token: session.accessToken,
  id_token: session.idToken,
  access_token_expires_at: session.accessTokenExpiresAt,
  grant_ends_at: session.grantEndsAt,
  // The port's `createdAt`: the grant's start, not the row's, so it is not called `created_at`.
  grant_started_at: session.createdAt,
})

const profileOf = (session: Session): UserProfile => ({
  sub: session.sub,
  accountType: session.accountType,
  displayName: session.displayName,
  avatarUrl: session.avatarUrl,
})

const pendingOf = (row: Selectable<AuthRequests>): PendingAuthorizationRequest => ({
  state: row.state,
  codeVerifier: row.code_verifier,
  nonce: row.nonce,
  sessionId: row.session_id,
  sub: row.sub,
  expiresAt: Number(row.expires_at),
})

/** Thrown inside an attempt whose budget is spent, so Kysely rolls it back; never escapes this module. */
class Expired extends Error {}

/** Answered by an attempt whose select found no row: the sweep removed it while the attempt waited. */
const VANISHED = Symbol('vanished')

/** `lock_not_available`, what Postgres raises when a statement waited past `lock_timeout`. */
const isLockTimeout = (failure: unknown): boolean =>
  typeof failure === 'object' && failure !== null && 'code' in failure && (failure as { code: unknown }).code === '55P03'

const setLockTimeout = async (lock: Transaction<DB>, ms: number): Promise<void> => {
  // `SET` takes no bind parameter; `ms` is a positive integer (see `budget`), rendered as a literal.
  await sql`set local lock_timeout = ${sql.lit(ms)}`.execute(lock)
}

/**
 * Runs `fn` with `sessionId`'s lock row held, and hands it the transaction holding it — which is what lets the sweep
 * delete the row it is holding, rather than leaving one behind for every session it removes.
 *
 * The row is inserted when it is not there yet, because the port's lock has to work for an id whose session does not
 * exist. Between that insert and the `FOR UPDATE` the sweep may remove the row — it only ever does so while holding
 * it, so a waiter can observe this once its blocker commits; the select then finds nothing and the whole transaction
 * is taken again, at most `maxAttempts` times.
 *
 * One deadline bounds the whole take: the wait for a `locks` connection, the insert, the select and every retry. The
 * budget is read from the clock after the connection, after the insert and at admission, and each statement's
 * `lock_timeout` is the smaller of `lockTimeoutMs` and the budget left when it starts, so no statement outlives the
 * deadline by more than a round trip. A real-time timer backs the wait that has not reached Postgres yet (a
 * saturated pool, a busy scoped client): it abandons the attempt, which rolls back once it gets its connection. Every
 * way of running out is a `SessionBusyError`. `fn` never starts after the deadline; once started, it is outside it.
 *
 * `fn`'s own statements run on another handle and commit on their own. A throwing `fn` therefore releases the lock
 * without undoing what it has already written — which `refreshSession` depends on: it saves the rotated tokens and
 * *then* rethrows, and losing that write would make the next refresh a token reuse.
 */
export const acquireSessionLock = async <T>(
  locks: Database,
  sessionId: string,
  fn: (lock: Transaction<DB>) => Promise<T>,
  options: SessionLockOptions = {},
): Promise<T> => {
  const { clock, lockTimeoutMs, maxAttempts, deadlineMs } = lockSettingsOf(options)
  const deadlineAt = clock.now() + deadlineMs

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const remaining = deadlineAt - clock.now()
    if (remaining <= 0) {
      throw new SessionBusyError('deadline')
    }

    let expired = false
    let admit = (): void => {}
    const admitted = new Promise<'admitted'>(resolve => {
      admit = () => resolve('admitted')
    })
    /** What the next statement may wait; throws once the deadline has passed by the clock or by the timer. */
    const budget = (): number => {
      const left = deadlineAt - clock.now()
      if (expired || left <= 0) {
        throw new Expired()
      }
      // At least 1: a `lock_timeout` of 0 would disable it.
      return Math.max(1, Math.min(lockTimeoutMs, Math.ceil(left)))
    }

    const run = locks.transaction().execute(async lock => {
      // The connection wait and the BEGIN have been paid for.
      let timeout = budget()
      await setLockTimeout(lock, timeout)
      await lock
        .insertInto('session_locks')
        .values({ id: sessionId })
        .onConflict(oc => oc.column('id').doNothing())
        .execute()
      // The insert's wait has been paid for: lower the cap if it shrank, which with the defaults never happens.
      const next = budget()
      if (next < timeout) {
        timeout = next
        await setLockTimeout(lock, timeout)
      }
      const row = await lock.selectFrom('session_locks').select('id').where('id', '=', sessionId).forUpdate().executeTakeFirst()
      // Admission: the clock decides as well as the timer, so a late timer cannot let `fn` start past the deadline.
      budget()
      if (row === undefined) {
        return VANISHED
      }
      admit()
      return { value: await fn(lock) }
    })

    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<'timeout'>(resolve => {
      timer = setTimeout(() => resolve('timeout'), remaining)
    })
    let winner: 'admitted' | 'settled' | 'timeout'
    try {
      // The acquisition only: once admitted, `fn` runs to completion whatever the deadline.
      winner = await Promise.race([
        admitted,
        run.then(
          () => 'settled' as const,
          () => 'settled' as const,
        ),
        timedOut,
      ])
    } finally {
      clearTimeout(timer)
    }

    if (winner === 'timeout') {
      // Abandoned: when it gets its connection, or its blocked statement returns (by its capped `lock_timeout` at the
      // latest), the next `budget()` throws, Kysely rolls back and the connection goes back to its pool or lease.
      expired = true
      void run.catch(() => undefined)
      throw new SessionBusyError('deadline')
    }

    if (winner === 'admitted') {
      // Whatever `fn` throws is the caller's, unchanged.
      const outcome = await run
      return (outcome as { value: T }).value
    }

    let outcome: typeof VANISHED | { value: T }
    try {
      outcome = await run
    } catch (failure) {
      if (failure instanceof Expired) {
        throw new SessionBusyError('deadline')
      }
      if (isLockTimeout(failure)) {
        throw new SessionBusyError('lock_timeout', { cause: failure })
      }
      throw failure
    }
    if (outcome !== VANISHED) {
      return outcome.value
    }
  }

  throw new SessionBusyError('attempts')
}

/**
 * The Postgres `SessionStore`. Every statement but the lock transaction runs on `main`; the lock transaction runs on
 * `locks`, since a holder occupies its connection for as long as it holds. `clock` is what `saveSession` stamps the
 * users snapshot with and what `takePendingRequest` reads expiry against; `lock` bounds `withSessionLock`.
 */
export const createPgSessionStore = (
  { main, locks }: DatabaseHandles,
  { clock, lock = {} }: { clock: Clock; lock?: SessionLockOptions },
): SessionStore => {
  // Refused here rather than on the first take: a bad bound is a mistake in the composition.
  const lockOptions = lockSettingsOf(lock)

  return {
    getSession: async id => {
      const row = await main.selectFrom('sessions').selectAll().where('id', '=', id).executeTakeFirst()
      return row === undefined ? undefined : sessionOf(row)
    },

    /**
     * The one choke point every grant flows through — a code exchange, a refresh and a guest grant alike — so the
     * `users` snapshot is upserted here from the claims the session carries, inside the session's own transaction.
     * `created_at` is left to the insert: a conflict only moves the snapshot on. No lock is taken: a fresh session
     * needs none, and an existing one is saved under the lock its caller holds.
     */
    saveSession: async session => {
      const columns = columnsOf(session)
      await main.transaction().execute(async trx => {
        await upsertUser(trx, profileOf(session), new Date(clock.now()))
        await trx
          .insertInto('sessions')
          .values({ id: session.id, ...columns })
          .onConflict(oc => oc.column('id').doUpdateSet(columns))
          .execute()
      })
    },

    deleteSession: async id => {
      await main.deleteFrom('sessions').where('id', '=', id).execute()
    },

    savePendingRequest: async request => {
      const columns = {
        code_verifier: request.codeVerifier,
        nonce: request.nonce,
        session_id: request.sessionId,
        sub: request.sub,
        expires_at: request.expiresAt,
      }
      await main
        .insertInto('auth_requests')
        .values({ state: request.state, ...columns })
        .onConflict(oc => oc.column('state').doUpdateSet(columns))
        .execute()
    },

    /**
     * Consumed by the delete itself, so a second take of the same state finds nothing. An expired row is consumed too
     * and still answered `undefined` — a consume, not a sweep: expired rows are a scheduled job's.
     */
    takePendingRequest: async state => {
      const row = await main.deleteFrom('auth_requests').where('state', '=', state).returningAll().executeTakeFirst()
      if (row === undefined) {
        return undefined
      }
      const request = pendingOf(row)
      return request.expiresAt <= clock.now() ? undefined : request
    },

    withSessionLock: (sessionId, fn) => acquireSessionLock(locks, sessionId, () => fn(), lockOptions),
  }
}
