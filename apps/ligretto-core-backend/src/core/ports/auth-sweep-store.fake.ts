import type { AuthSweepStore } from './auth-sweep-store.ts'
import { SessionBusyError } from './session-store.ts'

export type FakeAuthSweepStore = AuthSweepStore & {
  /** Pending sign-ins: `state → expiresAt`. */
  authRequests: Map<string, number>
  /** Sessions by id. */
  sessions: Map<string, { sub: string; grantEndsAt: number }>
  /** The ids that have a lock row. */
  sessionLocks: Set<string>
  /** Ids whose lock cannot be taken: `deleteExpiredSession` throws `SessionBusyError('lock_timeout')` for them. */
  refuse: Set<string>
  /** A writer that recreated the session while the sweep waited: the new `grantEndsAt`, applied before the re-check. */
  recreate: Map<string, number>
}

/** The in-memory `AuthSweepStore`: no lock is ever held, so no orphan is ever skipped. */
export const createFakeAuthSweepStore = (): FakeAuthSweepStore => {
  const authRequests = new Map<string, number>()
  const sessions = new Map<string, { sub: string; grantEndsAt: number }>()
  const sessionLocks = new Set<string>()
  const refuse = new Set<string>()
  const recreate = new Map<string, number>()

  return {
    authRequests,
    sessions,
    sessionLocks,
    refuse,
    recreate,
    deleteExpiredAuthRequests: async cutoff => {
      let deleted = 0
      for (const [state, expiresAt] of authRequests) {
        if (expiresAt <= cutoff) {
          authRequests.delete(state)
          deleted += 1
        }
      }
      return deleted
    },
    expiredSessions: async retainUntil =>
      [...sessions]
        .filter(([, session]) => session.grantEndsAt <= retainUntil)
        .map(([id, { sub }]) => ({ id, sub }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    deleteExpiredSession: async (id, retainUntil) => {
      if (refuse.has(id)) {
        throw new SessionBusyError('lock_timeout')
      }
      const session = sessions.get(id)
      const recreated = recreate.get(id)
      if (session !== undefined && recreated !== undefined) {
        session.grantEndsAt = recreated
      }
      if (session === undefined || session.grantEndsAt > retainUntil) {
        return false
      }
      sessions.delete(id)
      sessionLocks.delete(id)
      return true
    },
    deleteOrphanedSessionLocks: async () => {
      let deleted = 0
      for (const id of sessionLocks) {
        if (!sessions.has(id)) {
          sessionLocks.delete(id)
          deleted += 1
        }
      }
      return deleted
    },
  }
}
