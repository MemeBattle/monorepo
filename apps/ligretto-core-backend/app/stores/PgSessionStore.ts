/**
 * The `SessionStore` of `@memebattle/ligretto-auth` over this application's own Postgres.
 *
 * The port states the contract (`packages/ligretto-auth/src/session-store.ts`); what is decided here is how it is
 * met on a database: the lock is a row in `session_locks` taken with `SELECT … FOR UPDATE` inside a transaction,
 * which is also what works over Hyperdrive's per-request connection, and every session write carries the profile
 * snapshot into `users` in the same transaction.
 */

import type { Database } from '@adonisjs/lucid/database'
import type { QueryClientContract, TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { AccountType, PendingAuthorizationRequest, Session, SessionStore } from '@memebattle/ligretto-auth'

/** A `sessions` row, with the column names the database actually carries. */
interface SessionRow {
  id: string
  sub: string
  account_type: AccountType
  display_name: string | null
  avatar_url: string | null
  refresh_token: string
  access_token: string
  id_token: string
  /** bigint: `pg` hands these over as strings. */
  access_token_expires_at: string | number
  grant_ends_at: string | number
  /** The port's `createdAt`; see the migration for why it is not called `created_at`. */
  grant_started_at: string | number
}

interface AuthRequestRow {
  state: string
  code_verifier: string
  nonce: string
  session_id: string | null
  sub: string | null
  expires_at: string | number
}

export interface PgSessionStoreOptions {
  db: Database
  /** The connection every statement but a lock transaction runs on. */
  connectionName?: string
  /** The connection lock transactions run on; separate, because a holder occupies it for as long as it holds. */
  lockConnectionName?: string
  /** The clock expiry is read against. Tests drive it instead of waiting out a TTL. */
  now?: () => number
}

/** The rows of a raw result: `pg` answers `{ rows }`. */
const rowsOf = <Row>(result: unknown): Row[] => (result as { rows?: Row[] }).rows ?? []

const sessionOf = (row: SessionRow): Session => ({
  id: row.id,
  sub: row.sub,
  accountType: row.account_type,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  refreshToken: row.refresh_token,
  accessToken: row.access_token,
  accessTokenExpiresAt: Number(row.access_token_expires_at),
  grantEndsAt: Number(row.grant_ends_at),
  idToken: row.id_token,
  createdAt: Number(row.grant_started_at),
})

const rowOf = (session: Session) => ({
  id: session.id,
  sub: session.sub,
  account_type: session.accountType,
  display_name: session.displayName,
  avatar_url: session.avatarUrl,
  refresh_token: session.refreshToken,
  access_token: session.accessToken,
  id_token: session.idToken,
  access_token_expires_at: session.accessTokenExpiresAt,
  grant_ends_at: session.grantEndsAt,
  grant_started_at: session.createdAt,
})

const pendingOf = (row: AuthRequestRow): PendingAuthorizationRequest => ({
  state: row.state,
  codeVerifier: row.code_verifier,
  nonce: row.nonce,
  sessionId: row.session_id,
  sub: row.sub,
  expiresAt: Number(row.expires_at),
})

/**
 * Runs `fn` with `sessionId`'s lock row held, and hands it the transaction holding it — which is what lets the
 * sweep delete the row it is holding, rather than leaving one behind for every session it removes.
 *
 * The row is inserted when it is not there yet, because the port's lock has to work for an id whose session does
 * not exist. Between that insert and the `FOR UPDATE` the sweep may remove the row — it only ever does so while
 * holding it, so a waiter can observe this once its blocker commits; the select then finds nothing and the whole
 * transaction is taken again.
 *
 * `fn`'s own statements run on another connection and commit on their own. A throwing `fn` therefore releases the
 * lock without undoing what it has already written — which `refreshSession` depends on: it saves the rotated
 * tokens and *then* rethrows, and losing that write would make the next refresh a token reuse.
 */
export const acquireSessionLock = async <T>(
  locks: QueryClientContract,
  sessionId: string,
  fn: (lock: TransactionClientContract) => Promise<T>,
): Promise<T> => {
  for (;;) {
    const lock = await locks.transaction()
    let held: boolean
    try {
      await lock.rawQuery('insert into session_locks (id) values (?) on conflict (id) do nothing', [sessionId])
      const selected = await lock.rawQuery('select id from session_locks where id = ? for update', [sessionId])
      held = rowsOf(selected).length > 0
    } catch (failure) {
      await lock.rollback()
      throw failure
    }

    if (!held) {
      await lock.commit()
      continue
    }

    try {
      const result = await fn(lock)
      await lock.commit()
      return result
    } catch (failure) {
      await lock.rollback()
      throw failure
    }
  }
}

export const createPgSessionStore = ({
  db,
  connectionName = 'pg',
  lockConnectionName = 'pgLocks',
  now = Date.now,
}: PgSessionStoreOptions): SessionStore => {
  const main = () => db.connection(connectionName)
  const locks = () => db.connection(lockConnectionName)

  return {
    getSession: async id => {
      const row = await main().from('sessions').where('id', id).first()
      return row === undefined || row === null ? undefined : sessionOf(row as SessionRow)
    },

    /**
     * The one choke point every grant flows through — a code exchange, a refresh and a guest grant alike — so the
     * `users` snapshot is upserted here from the claims the session carries, inside the session's own transaction.
     * `created_at` is left to the insert: a conflict only moves the snapshot on.
     */
    saveSession: async session => {
      const at = new Date(now())
      await main().transaction(async trx => {
        await trx
          .table('users')
          .insert({
            cas_id: session.sub,
            account_type: session.accountType,
            display_name: session.displayName,
            avatar_url: session.avatarUrl,
            created_at: at,
            updated_at: at,
          })
          .onConflict('cas_id')
          .merge(['account_type', 'display_name', 'avatar_url', 'updated_at'])

        await trx.table('sessions').insert(rowOf(session)).onConflict('id').merge()
      })
    },

    deleteSession: async id => {
      await main().from('sessions').where('id', id).delete()
    },

    savePendingRequest: async request => {
      await main()
        .table('auth_requests')
        .insert({
          state: request.state,
          code_verifier: request.codeVerifier,
          nonce: request.nonce,
          session_id: request.sessionId,
          sub: request.sub,
          expires_at: request.expiresAt,
        })
        .onConflict('state')
        .merge()
    },

    /**
     * Consumed by the delete itself, so a second take of the same state finds nothing. An expired row is consumed
     * too and still answered `undefined` — a consume, not a sweep: expired rows are a scheduled job's.
     */
    takePendingRequest: async state => {
      const deleted = await main().rawQuery('delete from auth_requests where state = ? returning *', [state])
      const row = rowsOf<AuthRequestRow>(deleted)[0]
      if (row === undefined) {
        return undefined
      }
      const request = pendingOf(row)
      return request.expiresAt <= now() ? undefined : request
    },

    withSessionLock: async (sessionId, fn) => await acquireSessionLock(locks(), sessionId, async () => await fn()),
  }
}
