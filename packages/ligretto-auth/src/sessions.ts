/**
 * The session rules of [INTEGRATION.md §7 and §9](../../../apps/cas/docs/INTEGRATION.md), written once here rather
 * than in every consumer: the rotated refresh token is persisted before the new access token is used, refreshes are
 * serialised per grant and skipped while the access token is still fresh, a grant that ended deletes its session, a
 * guest upgrade force-refreshes before building its hint, and a callback whose `sub` is not the one that started the
 * sign-in is reported rather than silently merged.
 *
 * Everything here is policy over the two ports above it: the `CasClient` of `./cas-client` and the `SessionStore` of
 * `./session-store`. The store's session-write rule binds every function: a mutation of an existing session happens
 * inside `withSessionLock` on its id, with a re-read inside the lock; only a brand-new session with a fresh id is
 * written without one.
 */

import { base64url } from 'jose'
import type { CasClient, Tokens } from './cas-client'
import { TokenEndpointError } from './errors'
import type { Session, SessionStore } from './session-store'

/**
 * A grant ends 30 days after it was created, whatever happens, and refreshing never moves it (ADR 0012 (g)). CAS
 * does not transmit the end, so it is computed here; a CAS that ever changes the policy changes this constant.
 */
export const GRANT_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000

/**
 * How long a sign-in may stay in flight: an hour, the life of the upgrade session CAS opens for it (ADR 0015 (b)).
 * Shorter would strand a user partway through registering a passkey; the code itself is still spent in 60 seconds.
 */
export const PENDING_REQUEST_TTL_MS = 60 * 60 * 1000

/** The refresh runs when the access token has less than this left, unless the caller forces or overrides it. */
const DEFAULT_MIN_VALIDITY_MS = 60_000

/** The session id is unguessable: 32 random bytes, like a `state`. */
const newSessionId = (): string => base64url.encode(crypto.getRandomValues(new Uint8Array(32)))

/** A session the store does not hold: it was never created, or its grant ended and it was deleted. */
export class UnknownSessionError extends Error {
  readonly code = 'unknown_session'
  readonly sessionId: string

  constructor(sessionId: string) {
    super(`No session with the id ${JSON.stringify(sessionId)}.`)
    this.name = 'UnknownSessionError'
    this.sessionId = sessionId
  }
}

/**
 * A callback whose `state` names no sign-in this backend started: unknown, already completed, or older than the
 * pending request's TTL. The request is not ours and no code is redeemed for it (§4).
 */
export class CallbackStateError extends Error {
  readonly code = 'unknown_state'

  constructor(message: string) {
    super(message)
    this.name = 'CallbackStateError'
  }
}

/** What the session functions work against. */
export interface SessionContext {
  client: CasClient
  store: SessionStore
  /** The clock expiries are computed against. Tests drive it instead of waiting one out. */
  now?: () => number
}

export interface RefreshSessionOptions {
  /** Refresh even when the access token is still fresh — what a guest upgrade needs (§9). */
  force?: boolean
  /** Refresh when the access token has less than this left. Defaults to a minute. */
  minValidityMs?: number
}

export interface BeginSignInOptions {
  /** The session starting the sign-in: a guest upgrading (§9), or a user signing in again. */
  sessionId?: string
  scope?: string
  prompt?: string
}

export interface BeginSignInResult {
  /** Where to send the browser. */
  url: string
  state: string
}

export interface CompleteSignInResult {
  session: Session
  /**
   * The `sub` the sign-in started from, when the callback came back with another one: the browser was already signed
   * in to CAS as somebody else, so the guest was not upgraded (§9). The old session is gone and the one returned is
   * new; what to do with the old account's data is the application's decision. `null` when there is nothing to
   * report.
   */
  previousSub: string | null
}

export interface CompleteSignInOptions {
  code: string
  state: string
}

const sessionOf = (id: string, tokens: Tokens, at: number, grantEndsAt: number, createdAt: number): Session => ({
  id,
  sub: tokens.profile.sub,
  accountType: tokens.profile.accountType,
  displayName: tokens.profile.displayName,
  avatarUrl: tokens.profile.avatarUrl,
  refreshToken: tokens.refreshToken,
  accessToken: tokens.accessToken,
  accessTokenExpiresAt: at + tokens.expiresIn * 1000,
  grantEndsAt,
  idToken: tokens.idToken,
  createdAt,
})

/** A session for a grant that has just been created: a fresh id, and the 30 days running from now. */
const sessionForNewGrant = (tokens: Tokens, at: number, id: string = newSessionId()): Session => sessionOf(id, tokens, at, at + GRANT_LIFETIME_MS, at)

const isGrantOver = (failure: unknown): boolean => failure instanceof TokenEndpointError && failure.code === 'invalid_grant'

/**
 * The session with a usable access token, refreshing it when it is about to expire.
 *
 * The whole of it runs inside the session's lock and re-reads the session there, so two callers cost CAS one token
 * request: the second finds the token the first stored and skips (§7's pseudo-code). The rotated refresh token is
 * saved before this resolves, so a caller never holds an access token whose refresh token was not persisted.
 *
 * `invalid_grant` means the grant is over — expired, revoked, or retired by an upgrade: the session is deleted and
 * the typed error rethrown, for the caller to sign the user in again or mint a new guest. Every other failure leaves
 * the session as it was.
 */
export const refreshSession = async (ctx: SessionContext, sessionId: string, options: RefreshSessionOptions = {}): Promise<Session> => {
  const { client, store, now = Date.now } = ctx
  const { force = false, minValidityMs = DEFAULT_MIN_VALIDITY_MS } = options

  return await store.withSessionLock(sessionId, async () => {
    const session = await store.getSession(sessionId)
    if (session === undefined) {
      throw new UnknownSessionError(sessionId)
    }
    if (!force && session.accessTokenExpiresAt - now() > minValidityMs) {
      return session
    }

    let tokens: Tokens
    try {
      tokens = await client.refresh(session.refreshToken)
    } catch (failure) {
      if (isGrantOver(failure)) {
        // The lock is still held and was held across the whole read-refresh-write, so this deletes the session the
        // refresh read and nothing a later writer put in its place.
        await store.deleteSession(sessionId)
      }
      throw failure
    }

    // The 30 days are the grant's and are not moved by a refresh; the snapshot is taken again, since a changed
    // display name arrives with the refreshed ID token (§7).
    const refreshed = sessionOf(session.id, tokens, now(), session.grantEndsAt, session.createdAt)
    await store.saveSession(refreshed)
    return refreshed
  })
}

/**
 * The sign-in of §4, and the guest upgrade of §9 when `sessionId` is given.
 *
 * With a session the grant is force-refreshed first and the **newly issued** ID token becomes the `id_token_hint`:
 * CAS checks the hint's `exp` strictly and a stored ID token is never reused, so the refresh runs even when the
 * access token is fresh (ADR 0015 (c)). The pending request records the `sub` that session held, which is what the
 * callback's comparison runs against.
 */
export const beginSignIn = async (ctx: SessionContext, options: BeginSignInOptions = {}): Promise<BeginSignInResult> => {
  const { client, store, now = Date.now } = ctx
  const { sessionId, scope, prompt } = options

  const session = sessionId === undefined ? undefined : await refreshSession(ctx, sessionId, { force: true })
  const request = await client.authorizationRequest({ scope, prompt, idTokenHint: session?.idToken })

  await store.savePendingRequest({
    state: request.state,
    codeVerifier: request.codeVerifier,
    nonce: request.nonce,
    sessionId: session?.id ?? null,
    sub: session?.sub ?? null,
    expiresAt: now() + PENDING_REQUEST_TTL_MS,
  })

  return { url: request.url, state: request.state }
}

/**
 * The callback of §4 and §5: the pending request is consumed, the code redeemed, and the session written.
 *
 * **Precondition.** The caller has already checked that this callback arrived on the browser that started the
 * sign-in — §4 requires `state` compared with the value stored *for this browser*. `takePendingRequest` proves only
 * that the state exists in a store shared by every browser, so without that check a `state` captured from one
 * browser could be completed on another. The cookie that carries it belongs to the HTTP layer, not here.
 *
 * When the `sub` that comes back is not the one the sign-in started from, the browser was already signed in to CAS
 * as another account: the result reports the previous `sub`, the old session is deleted, and the returned session is
 * a new one carrying nothing of it (§9). The report comes from the snapshot taken at `beginSignIn`, so it survives
 * the old session having been deleted meanwhile — which an upgrade makes routine, since it revokes the guest's
 * grants and the next refresh deletes the session.
 */
export const completeSignIn = async (ctx: SessionContext, { code, state }: CompleteSignInOptions): Promise<CompleteSignInResult> => {
  const { client, store, now = Date.now } = ctx

  const pending = await store.takePendingRequest(state)
  if (pending === undefined) {
    throw new CallbackStateError('The callback names no sign-in this backend started, or one that has expired or already completed.')
  }

  // Outside any lock: a round-trip to CAS must not hold a session's lock open.
  const tokens = await client.exchangeCode({ code, codeVerifier: pending.codeVerifier, nonce: pending.nonce })
  const previousSub = pending.sub !== null && pending.sub !== tokens.profile.sub ? pending.sub : null
  const initiating = pending.sessionId

  if (initiating === null) {
    const session = sessionForNewGrant(tokens, now())
    await store.saveSession(session)
    return { session, previousSub }
  }

  return await store.withSessionLock(initiating, async () => {
    const existing = await store.getSession(initiating)
    // The upgrade, or a plain re-sign-in: the same account, so the session keeps its id, and the exchange created a
    // new grant whose 30 days start now.
    if (existing !== undefined && existing.sub === tokens.profile.sub) {
      const session = sessionForNewGrant(tokens, now(), existing.id)
      await store.saveSession(session)
      return { session, previousSub }
    }
    if (existing !== undefined) {
      await store.deleteSession(initiating)
    }
    const session = sessionForNewGrant(tokens, now())
    await store.saveSession(session)
    return { session, previousSub }
  })
}

/**
 * A guest, minted with the guest grant of §8: no browser, no UI, no name. `rate_limit_exceeded` comes out as the
 * typed error with its `retryAfterSeconds`, for the caller to tell the user and wait rather than retry in a loop.
 */
export const mintGuest = async (ctx: SessionContext, options: { scope?: string } = {}): Promise<Session> => {
  const { client, store, now = Date.now } = ctx
  const tokens = await client.guestGrant({ scope: options.scope })
  const session = sessionForNewGrant(tokens, now())
  await store.saveSession(session)
  return session
}
