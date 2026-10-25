import type { AuthSweepStore } from '../../core/ports/auth-sweep-store.ts'
import type { DatabaseHandles } from './database.ts'
import { acquireSessionLock, lockSettingsOf } from './session-store.ts'
import type { SessionLockOptions } from './session-store.ts'

/**
 * The sweep's statements on Postgres. Everything runs on `main` except the lock transaction, which runs on `locks`
 * through the session store's own `acquireSessionLock`, with the same bounds. The epoch columns are `bigint`, which
 * the generated types read as strings, so the cutoffs are compared as such.
 */
export const createPgAuthSweepStore = ({ main, locks }: DatabaseHandles, lock: SessionLockOptions = {}): AuthSweepStore => {
  const lockOptions = lockSettingsOf(lock)

  return {
    deleteExpiredAuthRequests: async cutoff => {
      const { numDeletedRows } = await main.deleteFrom('auth_requests').where('expires_at', '<=', String(cutoff)).executeTakeFirst()
      return Number(numDeletedRows)
    },

    expiredSessions: async retainUntil =>
      await main.selectFrom('sessions').select(['id', 'sub']).where('grant_ends_at', '<=', String(retainUntil)).orderBy('id').execute(),

    // On a scoped `locks` handle a take the deadline abandoned rolls back before the next candidate's take gets the
    // client (`createScopedDatabase`), and that wait counts against the next take's deadline.
    deleteExpiredSession: async (id, retainUntil) =>
      await acquireSessionLock(
        locks,
        id,
        async held => {
          const { numDeletedRows } = await main
            .deleteFrom('sessions')
            .where('id', '=', id)
            .where('grant_ends_at', '<=', String(retainUntil))
            .executeTakeFirst()
          const deleted = Number(numDeletedRows) > 0
          if (deleted) {
            // Removed in the transaction holding it, so a waiter wakes to find no row and takes a fresh one.
            await held.deleteFrom('session_locks').where('id', '=', id).execute()
          }
          return deleted
        },
        lockOptions,
      ),

    deleteOrphanedSessionLocks: async () => {
      const { numDeletedRows } = await main
        .deleteFrom('session_locks')
        .where('id', 'in', qb =>
          qb
            .selectFrom('session_locks as l')
            .select('l.id')
            .where(eb => eb.not(eb.exists(eb.selectFrom('sessions as s').select('s.id').whereRef('s.id', '=', 'l.id'))))
            .forUpdate()
            .skipLocked(),
        )
        .executeTakeFirst()
      return Number(numDeletedRows)
    },
  }
}
