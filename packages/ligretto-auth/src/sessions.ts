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
import type { CasClient, Grant, Tokens } from './cas-client'
import { UnusableGrantError } from './cas-client'
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
  /** `none` only: CAS answers every other `prompt` value `invalid_request` (§4). */
  prompt?: 'none'
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
const sessionForNewGrant = (tokens: Tokens, at: number): Session => sessionOf(newSessionId(), tokens, at, at + GRANT_LIFETIME_MS, at)

/**
 * The session with the tokens of a rotation that happened, and nothing else of it: the account snapshot stays the one
 * validated claims last gave, because the ID token these came in could not be validated. The rotated ID token is
 * stored all the same — it is the one CAS issued for this grant, and the one it was asked to replace is older still.
 *
 * The access token is stamped expired rather than given the lifetime CAS announced: this bundle came with an ID token
 * the client refused, so the freshness skip below must not hand it out as a validated session. The next ordinary call
 * therefore refreshes for real, presenting the rotated token — which validates once what refused the ID token (a key
 * not yet published, a JWKS that could not be fetched) has passed, and fails again otherwise.
 */
const withRotatedTokens = (session: Session, grant: Grant, at: number): Session => ({
  ...session,
  refreshToken: grant.refreshToken,
  accessToken: grant.accessToken,
  accessTokenExpiresAt: at,
  idToken: grant.idToken,
})

const isGrantOver = (failure: unknown): boolean => failure instanceof TokenEndpointError && failure.code === 'invalid_grant'

/**
 * The session with a usable access token, refreshing it when it is about to expire.
 *
 * The whole of it runs inside the session's lock and re-reads the session there, so two callers cost CAS one token
 * request: the second finds the token the first stored and skips (§7's pseudo-code). The rotated refresh token is
 * saved before this resolves, so a caller never holds an access token whose refresh token was not persisted.
 *
 * `invalid_grant` means the grant is over — expired, revoked, or retired by an upgrade: the session is deleted and
 * the typed error rethrown, for the caller to sign the user in again or mint a new guest. An `UnusableGrantError`
 * says CAS rotated and then answered an ID token this client cannot accept: the rotated tokens are written before
 * the error is rethrown, because the token the session presented is spent either way — with the access token stamped
 * expired, so a refusal never reads as a success on the next call. Every other failure — CAS away, the network —
 * leaves the session as it was.
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
      } else if (failure instanceof UnusableGrantError) {
        // CAS rotated before its ID token turned out to be unusable. The session takes the tokens that rotation
        // issued: keeping the one it presented would make the next refresh a reuse, which CAS reads as theft and
        // answers by revoking the whole grant — a guest would lose its account over a key rotation.
        await store.saveSession(withRotatedTokens(session, failure.grant, now()))
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
 * The session returned always has a fresh id, and a session that started the sign-in is deleted — an upgrade of the
 * very same account included: the tokens that come back are a full account's, so an id handed out while the account
 * was a guest must not reach them (ADR 0015 on session fixation). The caller installs the id the result carries.
 *
 * When the `sub` that comes back is not the one the sign-in started from, the browser was already signed in to CAS
 * as another account: the result reports the previous `sub`, the old session is deleted, and the returned session
 * carries nothing of it (§9). The report comes from the snapshot taken at `beginSignIn`, so it survives
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
    // The id that started the sign-in is retired whatever came back, the upgrade of the same account included: the
    // new grant is the full account's, and an id that was handed out while it was a guest's must not reach it. That
    // is the session fixation ADR 0015 names as the upgrade's threat, and CAS's own revocation cannot reach a row of
    // this store. The caller installs the id the result carries.
    if ((await store.getSession(initiating)) !== undefined) {
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
