/**
 * Where an application keeps what it knows about a signed-in user, as a port: this package states the shape and the
 * concurrency contract, and each runtime brings its own implementation — the in-memory one below for tests, a
 * Postgres one next to the application's own schema in production.
 *
 * The contract is what [INTEGRATION.md §7](../../../apps/cas/docs/INTEGRATION.md) demands of a backend: one refresh
 * in flight per grant, and the rotated refresh token persisted before the new access token is used. Both follow from
 * `withSessionLock`, so the lock is part of the port rather than an implementation's detail.
 */

import type { AccountType } from './generated/models/AccountType'

/** An application session: one grant, and the snapshot of the account it belongs to. Times are epoch milliseconds. */
export interface Session {
  /** This application's own session id, not CAS's: unguessable, and the key every lock is taken on. */
  id: string
  /** The account id, stable across an upgrade. Key the application's data on it (§8). */
  sub: string
  accountType: AccountType
  displayName: string | null
  avatarUrl: string | null
  /** Opaque, rotated by every refresh; server-side only, never in the browser (§5). */
  refreshToken: string
  accessToken: string
  accessTokenExpiresAt: number
  /**
   * When the grant ends: 30 days after it was created, absolute — refreshing never moves it, and signing out of CAS
   * does not end it (ADR 0012 (g)). Computed, because CAS does not transmit it.
   */
  grantEndsAt: number
  /** The latest ID token, which is what a logout and a guest upgrade are built from (§9, §11). */
  idToken: string
  /**
   * When this session's grant began, so `grantEndsAt` is always `createdAt` plus the 30 days. A refresh keeps it; a
   * code exchange creates a new grant and moves both, even where the session keeps its id through an upgrade.
   */
  createdAt: number
}

/**
 * A sign-in in flight: what the callback needs to check and redeem the code it carries.
 *
 * `sessionId` and `sub` snapshot the session that started the sign-in — an upgrade or a re-sign-in — at the moment it
 * started. The `sub` snapshot is what §9's comparison runs against, so a callback arriving for another account is
 * still reported when the initiating session has been deleted meanwhile, which is routine: an upgrade revokes the
 * guest's grants, and the refresh that discovers it deletes the session.
 */
export interface PendingAuthorizationRequest {
  state: string
  codeVerifier: string
  nonce: string
  /** The session that started the sign-in, or `null` for a plain one. */
  sessionId: string | null
  /** The `sub` that session held when the sign-in started, or `null`. */
  sub: string | null
  expiresAt: number
}

/**
 * The sessions and the sign-ins in flight of one application.
 *
 * **The session-write rule.** Every read-then-write of an existing session runs inside `withSessionLock` on that
 * session's id, and re-reads the session inside the lock. It is what keeps one refresh in flight per grant (§7) and
 * what stops two writers from deciding about the same session at once — a refresh that found the grant over must not
 * delete a sign-in that completed while it was waiting for CAS. An implementation backed by a database makes the
 * lock a row lock (`SELECT … FOR UPDATE`); the in-memory one chains promises.
 */
export interface SessionStore {
  getSession(id: string): Promise<Session | undefined>
  /** Upserts by `id`. */
  saveSession(session: Session): Promise<void>
  deleteSession(id: string): Promise<void>
  savePendingRequest(request: PendingAuthorizationRequest): Promise<void>
  /**
   * The request for `state`, consumed: a second take of the same `state` answers `undefined`, and so does an expired
   * one. A consume, not a sweep — nothing here cleans up on the request path; expired rows are a scheduled job's.
   */
  takePendingRequest(state: string): Promise<PendingAuthorizationRequest | undefined>
  /**
   * Runs `fn` with the session `sessionId` held against every other writer. The lock is keyed by id and works for an
   * id whose session does not exist: a writer deciding whether to recreate one takes it too.
   */
  withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T>
}

export interface InMemorySessionStoreOptions {
  /** The clock expiry is read against. Tests drive it instead of waiting out a TTL. */
  now?: () => number
}

/**
 * A `SessionStore` in the process's memory: everything a test needs, and nothing a deployment can use — sessions
 * live in one process and die with it.
 */
export const createInMemorySessionStore = ({ now = Date.now }: InMemorySessionStoreOptions = {}): SessionStore => {
  const sessions = new Map<string, Session>()
  const pending = new Map<string, PendingAuthorizationRequest>()
  /** The tail of each id's queue of holders; an id with no entry is free. */
  const locks = new Map<string, Promise<unknown>>()

  const withSessionLock = async <T>(sessionId: string, fn: () => Promise<T>): Promise<T> => {
    const held = locks.get(sessionId)
    // The next holder waits for this one to settle, a throw included: a failed holder releases the lock.
    const run = (async () => {
      await held?.catch(() => undefined)
      return await fn()
    })()
    const queued = run.catch(() => undefined)
    locks.set(sessionId, queued)
    try {
      return await run
    } finally {
      // Only the last holder clears the entry, so an id stops costing memory once its queue has drained.
      if (locks.get(sessionId) === queued) {
        locks.delete(sessionId)
      }
    }
  }

  return {
    getSession: async id => sessions.get(id),
    saveSession: async session => void sessions.set(session.id, session),
    deleteSession: async id => void sessions.delete(id),
    savePendingRequest: async request => void pending.set(request.state, request),
    takePendingRequest: async state => {
      const request = pending.get(state)
      if (request === undefined) {
        return undefined
      }
      pending.delete(state)
      return request.expiresAt <= now() ? undefined : request
    },
    withSessionLock,
  }
}
