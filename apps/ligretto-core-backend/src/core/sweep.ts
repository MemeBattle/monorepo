/**
 * The scheduled removal of what the session store has finished with — run by `pnpm sweep` (and later by the Worker's
 * `scheduled` handler), never on a request.
 *
 * Two cutoffs, because the two tables promise different things:
 *
 * - `auth_requests` go as soon as they expire. `takePendingRequest` already answers an expired row `undefined`, so
 *   nothing can be lost by removing one, and no cookie points at it.
 * - `sessions` are kept for the whole cookie grace past the end of their grant. The session cookie deliberately
 *   outlives `grantEndsAt` by `SESSION_COOKIE_GRACE_MS`, and within that window the stale id is still presented once:
 *   the refresh is refused `invalid_grant`, the session is deleted and the user is told they were signed out. Delete
 *   the row early and the id has nothing left to be refused against, so the one chance to report it is gone —
 *   `packages/ligretto-auth/src/transport.ts` binds a store's cleanup to this explicitly. Deleting a session *within*
 *   the grace is `refreshSession`'s job, not this one's.
 *
 * Every session is removed under its own lock, because the port holds a session against *every* other writer and
 * makes no exception for cleanup: without it, a refresh that was waiting on CAS could save the session back moments
 * after the sweep deleted it, leaving a row nothing will ever come back for.
 *
 * A candidate whose lock the run cannot take is counted, logged and left: it costs the rest of the run nothing, and
 * the next run takes it. The log names its account (`sub`), never its id: the id is the session's credential
 * (docs/adrs/logging.md).
 */

import type { AuthSweepStore } from './ports/auth-sweep-store.ts'
import type { Clock } from './ports/clock.ts'
import type { Logger } from './ports/logger.ts'
import { SessionBusyError } from './ports/session-store.ts'

export interface SweepCounts {
  authRequests: number
  sessions: number
  sessionLocks: number
  /** Candidates whose lock could not be taken, left for the next run. */
  failedSessions: number
}

export interface SweepExpiredAuthDeps {
  store: AuthSweepStore
  clock: Clock
  logger: Logger
  /** How long a session is kept past its grant: `SESSION_COOKIE_GRACE_MS` of `@memebattle/ligretto-auth`. */
  sessionRetentionMs: number
}

export const createSweepExpiredAuth =
  ({ store, clock, logger, sessionRetentionMs }: SweepExpiredAuthDeps) =>
  async (): Promise<SweepCounts> => {
    const at = clock.now()
    const authRequests = await store.deleteExpiredAuthRequests(at)

    const retainUntil = at - sessionRetentionMs
    let sessions = 0
    let failedSessions = 0
    for (const candidate of await store.expiredSessions(retainUntil)) {
      try {
        // One lock per transaction, so there is no ordering to deadlock on; a sweep that meets a refresh in progress
        // waits for it. The cutoff is re-checked under the lock: a session recreated meanwhile is fresh and stays.
        if (await store.deleteExpiredSession(candidate.id, retainUntil)) {
          sessions += 1
        }
      } catch (failure) {
        // A lock held past the take's deadline — a refresh parked on an unresponsive CAS — would otherwise abort
        // every candidate behind it and report none of what was already deleted. The locked re-check makes a
        // skipped candidate safe to take again on the next run.
        failedSessions += 1
        logger.warn('sweep_session_left', {
          sub: candidate.sub,
          error: failure instanceof Error ? failure.message : String(failure),
          code: failure instanceof SessionBusyError ? failure.code : undefined,
        })
      }
    }

    // Lock rows left by sessions that are gone. One currently held — a writer deciding whether to recreate the
    // session — is skipped rather than waited on; the next run collects it.
    const sessionLocks = await store.deleteOrphanedSessionLocks()

    return { authRequests, sessions, sessionLocks, failedSessions }
  }
