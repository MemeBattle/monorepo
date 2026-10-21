/**
 * The scheduled removal of what the session store has finished with — run by `auth:sweep`, never on a request.
 *
 * Two cutoffs, because the two tables promise different things:
 *
 * - `auth_requests` go as soon as they expire. `takePendingRequest` already answers an expired row `undefined`,
 *   so nothing can be lost by removing one, and no cookie points at it.
 * - `sessions` are kept for the whole cookie grace past the end of their grant. The session cookie deliberately
 *   outlives `grantEndsAt` by `SESSION_COOKIE_GRACE_MS`, and within that window the stale id is still presented
 *   once: the refresh is refused `invalid_grant`, the session is deleted and the user is told they were signed
 *   out. Delete the row early and the id has nothing left to be refused against, so the one chance to report it
 *   is gone — `packages/ligretto-auth/src/transport.ts` binds a store's cleanup to this explicitly. Deleting a
 *   session *within* the grace is `refreshSession`'s job, not this one's.
 *
 * Every session is removed under its own lock, because the port holds a session against *every* other writer and
 * makes no exception for cleanup: without it, a refresh that was waiting on CAS could save the session back
 * moments after the sweep deleted it, leaving a row nothing will ever come back for.
 */

import type { Database } from '@adonisjs/lucid/database'
import { SESSION_COOKIE_GRACE_MS } from '@memebattle/ligretto-auth'
import { acquireSessionLock } from '#app/stores/PgSessionStore'

export interface SweepExpiredAuthOptions {
  db: Database
  /** The clock the cutoffs are computed against. Tests drive it instead of waiting out a window. */
  now?: () => number
  connectionName?: string
  lockConnectionName?: string
}

export interface SweepExpiredAuthCounts {
  authRequests: number
  sessions: number
  sessionLocks: number
}

/** How many rows a statement removed: `pg` reports it as `rowCount`. */
const deletedBy = (result: unknown): number => (result as { rowCount?: number }).rowCount ?? 0

export const sweepExpiredAuth = async ({
  db,
  now = Date.now,
  connectionName = 'pg',
  lockConnectionName = 'pgLocks',
}: SweepExpiredAuthOptions): Promise<SweepExpiredAuthCounts> => {
  const main = () => db.connection(connectionName)
  const locks = () => db.connection(lockConnectionName)

  const at = now()
  const authRequests = deletedBy(await main().rawQuery('delete from auth_requests where expires_at <= ?', [at]))

  const retainUntil = at - SESSION_COOKIE_GRACE_MS
  const candidates = await main().from('sessions').where('grant_ends_at', '<=', retainUntil).select('id')

  let sessions = 0
  for (const candidate of candidates) {
    const id = (candidate as { id: string }).id
    // One lock per transaction, so there is no ordering to deadlock on; a sweep that meets a refresh in progress
    // simply waits for it.
    sessions += await acquireSessionLock(locks(), id, async lock => {
      // Re-checked under the lock: a session recreated on this id while the sweep was waiting is fresh and stays.
      const deleted = deletedBy(await main().rawQuery('delete from sessions where id = ? and grant_ends_at <= ?', [id, retainUntil]))
      if (deleted > 0) {
        // Removed in the transaction holding it, so a waiter wakes to find no row and takes a fresh one.
        await lock.rawQuery('delete from session_locks where id = ?', [id])
      }
      return deleted
    })
  }

  // Lock rows left by sessions that are gone. One currently held — a writer deciding whether to recreate the
  // session — is skipped rather than waited on; the next run collects it.
  const sessionLocks = deletedBy(
    await main().rawQuery(
      `delete from session_locks
        where id in (
          select l.id from session_locks l
          where not exists (select 1 from sessions s where s.id = l.id)
          for update skip locked
        )`,
    ),
  )

  return { authRequests, sessions, sessionLocks }
}
