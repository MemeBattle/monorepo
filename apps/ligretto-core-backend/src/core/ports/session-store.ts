/**
 * The session store. The port itself is `SessionStore` of `@memebattle/ligretto-auth`, which `src/core` does not
 * depend on; the Postgres implementation lives in `src/adapters/pg/session-store.ts`
 * (docs/adrs/session-store-locking.md). What this file declares is the one failure that implementation adds to the
 * port, so `src/http` can recognise it without importing an adapter.
 */

/**
 * Why the lock was not taken: a statement waited past `lock_timeout`, the take's deadline passed, or the row kept
 * vanishing.
 */
export type SessionBusyReason = 'lock_timeout' | 'deadline' | 'attempts'

const MESSAGES: Record<SessionBusyReason, string> = {
  lock_timeout: 'the session lock was not granted within lock_timeout',
  deadline: 'the session lock was not acquired within the deadline',
  attempts: 'the session lock row vanished on every attempt',
}

/**
 * The session's lock could not be taken in time: another writer holds it, or lock traffic is saturated. The request
 * can be repeated; `src/http` answers it as `503 session_busy` (docs/adrs/error-responses.md).
 *
 * The message is fixed per reason and never names the session: its id is the cookie value or the bearer credential,
 * and an error's message reaches the log (docs/adrs/logging.md).
 */
export class SessionBusyError extends Error {
  readonly code = 'session_busy' as const
  readonly reason: SessionBusyReason

  constructor(reason: SessionBusyReason, options?: { cause?: unknown }) {
    super(MESSAGES[reason], options)
    this.name = 'SessionBusyError'
    this.reason = reason
  }
}
