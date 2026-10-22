/**
 * The four routes of a sign-in, as plain `(Request) => Promise<Response>` functions: Hono, a bare Worker and an
 * Adonis adapter all mount the same handler, because none of them is mentioned here. Web standards only, as the rest
 * of the package.
 *
 * They are the HTTP half of what `./sessions` decides: `me` keeps a usable access token in front of the browser,
 * `sign-in` and `callback` run the authorization code flow of §4 and §5, `logout` the RP-initiated logout of §11.
 * Where the session id travels is `./transport`'s, and what the answers look like is declared in `./contract`, which
 * a browser bundle may import.
 *
 * **Known failures never become a 500.** Every typed refusal of the CAS client — `TokenEndpointError`, `ApiError`,
 * `InvalidIdTokenError`, `DiscoveryError`, `UnusableGrantError`, `CallbackStateError` — funnels through one mapping
 * to a 4xx or a 503 with a code of `AuthErrorCode`. CAS being unreachable is one of them: the transport types a
 * `fetch` rejection as an `ApiError`, so a provider outage is a 503 wherever it strikes. Only a bug here is left to
 * the host.
 */

import type { CasClient } from './cas-client'
import { UnusableGrantError } from './cas-client'
import { ApiError } from './client'
import type { AuthErrorResponse, MeResponse } from './contract'
import type { TokenEndpointErrorCode } from './errors'
import { DiscoveryError, InvalidIdTokenError, TokenEndpointError } from './errors'
import type { Session, SessionStore } from './session-store'
import type { BeginSignInResult, CompleteSignInResult, SessionContext } from './sessions'
import { beginSignIn, CallbackStateError, completeSignIn, endSession, mintGuest, refreshSession, UnknownSessionError } from './sessions'
import type { SessionTransportKind } from './transport'
import { clearStateCookie, createSessionTransport, redirect, setStateCookie, stateCookieOf } from './transport'

/**
 * The codes that mean CAS is away rather than refusing: transient, worth trying again. Typed as the token endpoint's
 * codes so a renamed one is caught here, and compared as plain strings where the code came off a query parameter.
 */
const UNAVAILABLE_CODES: readonly TokenEndpointErrorCode[] = ['temporarily_unavailable', 'server_error', 'internal_error']

const isUnavailableCode = (code: string): boolean => (UNAVAILABLE_CODES as readonly string[]).includes(code)

/**
 * The codes the authorization endpoint sends back (RFC 6749 §4.1.2.1) that mean CAS refused *this client* — its
 * registration, or the shape of the request built from it — rather than refusing the user or being away. Plain
 * strings, not the token endpoint's union: these arrive as a query parameter, and the two endpoints' catalogues
 * overlap without being the same one (`unsupported_response_type` is the authorization endpoint's alone).
 */
const REJECTED_AUTHORIZATION_CODES: readonly string[] = ['unauthorized_client', 'invalid_scope', 'invalid_request', 'unsupported_response_type']

export interface AuthHandlersOptions {
  client: CasClient
  store: SessionStore
  /** Where the session id travels: a `__Host-` cookie, or an `Authorization: Bearer` header. */
  transport: SessionTransportKind
  /** Where the callback sends the browser once it is signed in, and where a logout with nothing to end goes. */
  appUrl: string
  /** The session cookie's name in the `cookie` transport; `__Host-` prefixed. */
  cookieName?: string
  /** The clock expiries are computed against. Tests drive it instead of waiting one out. */
  now?: () => number
}

/** The four routes. None of them throws a known failure: it comes back as the answer it maps to. */
export interface AuthHandlers {
  /** `GET me`: who the user is and the access token to call this application's API with, minting a guest if needed. */
  me(request: Request): Promise<Response>
  /** `GET sign-in`: stores the sign-in in flight and sends the browser to CAS. */
  signIn(request: Request): Promise<Response>
  /** `GET callback`: checks the callback against this browser, redeems the code, installs the session. */
  callback(request: Request): Promise<Response>
  /** `GET logout`: ends this application's session, then sends the browser to CAS to end its own. */
  logout(request: Request): Promise<Response>
}

/** A known failure, as the status and body it is answered with. */
interface Refusal {
  status: number
  body: AuthErrorResponse
  /** The delay CAS prescribed, echoed to the caller. */
  retryAfterSeconds?: number
}

/** The grant behind a session is over — expired, revoked, or retired by an upgrade. What that means is the route's. */
const isGrantOver = (failure: unknown): failure is TokenEndpointError => failure instanceof TokenEndpointError && failure.code === 'invalid_grant'

/** The code of the refusal an `UnusableGrantError` wraps: what actually made the rotated grant unusable. */
const causeCodeOf = (cause: unknown): string | undefined =>
  cause instanceof InvalidIdTokenError || cause instanceof DiscoveryError ? cause.code : undefined

/**
 * Every typed failure of the CAS client as the answer it deserves, in one place so no route can let one through.
 * `undefined` means the failure is not one of them, and the host may have it.
 *
 * The failures that are route-aware — `invalid_grant` and `UnknownSessionError` — are decided by the route before
 * they ever reach here, because what they mean depends on what was being attempted: on `me` an ended grant is a new
 * guest, on `sign-in` it is a plain sign-in, at the callback it is a refused code.
 */
const refusalOf = (failure: unknown): Refusal | undefined => {
  if (failure instanceof TokenEndpointError) {
    if (failure.code === 'rate_limit_exceeded') {
      return {
        status: 429,
        body: { error: 'rate_limit_exceeded', description: failure.message },
        retryAfterSeconds: failure.retryAfterSeconds,
      }
    }
    if (failure.status >= 500 || isUnavailableCode(failure.code)) {
      return { status: 503, body: { error: 'cas_unavailable', description: failure.message, casError: failure.code } }
    }
    // Everything left — `invalid_client`, `unauthorized_client`, `invalid_scope`, `invalid_request`,
    // `unsupported_grant_type`, and an `invalid_grant` no route claimed — is CAS refusing this client's registration
    // or the shape of its request. A separate code from `cas_unavailable` because it is not transient: nothing the
    // user or a retry can do, and an operator reading the logs needs to see a configuration problem.
    return { status: 503, body: { error: 'cas_rejected', description: failure.message, casError: failure.code } }
  }
  if (failure instanceof ApiError) {
    // Something answered in CAS's place, outside its contract: a proxy's HTML page, an error body carrying no code,
    // a 2xx that is not JSON. The provider cannot be used right now, whatever is standing in front of it.
    return { status: 503, body: { error: 'cas_unavailable', description: failure.message, casError: failure.code } }
  }
  if (failure instanceof UnusableGrantError) {
    // The rotated tokens are already persisted by `refreshSession`, so nothing is lost by answering here.
    return {
      status: 503,
      body: { error: 'cas_unavailable', description: failure.message, casError: causeCodeOf(failure.cause) ?? failure.code },
    }
  }
  if (failure instanceof InvalidIdTokenError || failure instanceof DiscoveryError) {
    return { status: 503, body: { error: 'cas_unavailable', description: failure.message, casError: failure.code } }
  }
  if (failure instanceof CallbackStateError) {
    return { status: 400, body: { error: 'unknown_state', description: failure.message } }
  }
  return undefined
}

/**
 * The `error` CAS redirected the browser back with, as the answer it deserves.
 *
 * The same three buckets `refusalOf` sorts the token endpoint's codes into, because RFC 6749 §4.1.2.1 sends the same
 * families through the authorization endpoint: CAS away is transient, a registration or request-shape fault is
 * `cas_rejected`, and a user who said no — or a code this package does not know — is a sign-in that did not happen.
 * Sorting on transience alone would report a deployment with an unregistered scope as the user having cancelled.
 */
const authorizationRefusalOf = (code: string, description: string): Refusal => {
  if (isUnavailableCode(code)) {
    return { status: 503, body: { error: 'cas_unavailable', description, casError: code } }
  }
  if (REJECTED_AUTHORIZATION_CODES.includes(code)) {
    return { status: 503, body: { error: 'cas_rejected', description, casError: code } }
  }
  return { status: 400, body: { error: 'sign_in_failed', description, casError: code } }
}

const json = (status: number, body: unknown, headers: Headers = new Headers()): Response => {
  headers.set('Content-Type', 'application/json')
  headers.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(body), { status, headers })
}

const refusalResponse = ({ status, body, retryAfterSeconds }: Refusal): Response => {
  const headers = new Headers()
  if (retryAfterSeconds !== undefined) {
    headers.set('Retry-After', String(retryAfterSeconds))
  }
  return json(status, body, headers)
}

/**
 * Where the browser is sent once a sign-in is done, parsed once at construction.
 *
 * A relative value — `'/'` — would pass every route but one and fail on the callback's success path, after the new
 * session has been saved: an uncoded `TypeError` out of `new URL`, so a 500 at the end of a real sign-in with the
 * session orphaned. Refused at construction instead, as `createSessionTransport` refuses a cookie name without its
 * prefix: a mounting mistake belongs to the deploy, not to the first user who signs in.
 */
const appUrlOf = (appUrl: string): URL => {
  try {
    return new URL(appUrl)
  } catch (cause) {
    throw new TypeError(`The app URL must be absolute, since the callback redirects a browser to it; got ${JSON.stringify(appUrl)}.`, { cause })
  }
}

export const createAuthHandlers = (options: AuthHandlersOptions): AuthHandlers => {
  const { client, store, cookieName, now = Date.now } = options
  const appUrl = appUrlOf(options.appUrl)
  const transport = createSessionTransport(options.transport, { cookieName })
  const ctx: SessionContext = { client, store, now }

  /** The route's answer, with every known failure mapped; anything else is the host's. */
  const handled = async (answer: () => Promise<Response>): Promise<Response> => {
    try {
      return await answer()
    } catch (failure) {
      const refusal = refusalOf(failure)
      if (refusal === undefined) {
        throw failure
      }
      return refusalResponse(refusal)
    }
  }

  const meBody = (session: Session, signedOut: boolean, handedOver: boolean): MeResponse => ({
    user: { sub: session.sub, accountType: session.accountType, name: session.displayName, avatarUrl: session.avatarUrl },
    accessToken: session.accessToken,
    expiresAt: session.accessTokenExpiresAt,
    signedOut,
    sessionId: handedOver ? transport.inBody(session) : undefined,
  })

  /**
   * The answer for a session the browser already presented: it hands no session over.
   *
   * Nothing is gained by handing one over again — the browser has it, and the cookie's `Max-Age` is counted to
   * `grantEndsAt + SESSION_COOKIE_GRACE_MS`, which a refresh never moves — and something is lost. Responses are not
   * delivered in the order they were produced: a `me` from a refresh timer in another tab can arrive after a callback
   * has retired the session it names, and handing that id over again would put the retired one back on the browser
   * and leave the next `me` replacing a freshly signed-in account with a guest.
   */
  const meAnswer = (session: Session, signedOut: boolean): Response => json(200, meBody(session, signedOut, false))

  /** The answer for a session this request has just created: the browser is given it, the only way it ever learns it. */
  const meHandover = (session: Session, signedOut: boolean): Response => {
    const headers = new Headers()
    transport.install(headers, session, now())
    return json(200, meBody(session, signedOut, true), headers)
  }

  const me = async (request: Request): Promise<Response> =>
    await handled(async () => {
      const presented = transport.read(request)
      if (presented === undefined) {
        return meHandover(await mintGuest(ctx), false)
      }

      // Advisory, and deliberately outside the lock: it decides nothing but whether a `signedOut` report is due, so
      // the worst a race costs is a mis-report. Reading it inside the refresh's lock would mean a second round of
      // locking on every `me`.
      const before = await store.getSession(presented)

      try {
        return meAnswer(await refreshSession(ctx, presented), false)
      } catch (failure) {
        if (!(failure instanceof UnknownSessionError) && !isGrantOver(failure)) {
          throw failure
        }
        // The id names nothing usable any more: the user gets a guest, and is told they were signed out if what the
        // id named was a full account. A guest whose grant ran out had nothing to be signed out of.
        return meHandover(await mintGuest(ctx), before?.accountType === 'full')
      }
    })

  /** A sign-in from a session that may already be gone. The user asked to sign in, so it starts either way. */
  const beginSignInFrom = async (sessionId: string): Promise<BeginSignInResult> => {
    try {
      return await beginSignIn(ctx, { sessionId })
    } catch (failure) {
      if (failure instanceof UnknownSessionError || isGrantOver(failure)) {
        return await beginSignIn(ctx)
      }
      throw failure
    }
  }

  const signIn = async (request: Request): Promise<Response> =>
    await handled(async () => {
      const presented = transport.read(request)
      const begun = presented === undefined ? await beginSignIn(ctx) : await beginSignInFrom(presented)

      const headers = new Headers()
      // The browser binding §4 demands, in both transports: the callback compares the query's `state` with this.
      setStateCookie(headers, begun.state)
      return transport.navigation(begun.url, headers)
    })

  const callback = async (request: Request): Promise<Response> =>
    await handled(async () => {
      const query = new URL(request.url).searchParams
      const state = query.get('state')
      const expected = stateCookieOf(request)

      // §4: the `state` is compared with the value stored for *this* browser, before anything is exchanged. The
      // cookie is left in place on every refusal below — clearing it would let a stray callback kill a sign-in this
      // browser legitimately has in flight, and it expires with the pending request anyway.
      if (expected === undefined || state === null || state !== expected) {
        return refusalResponse({
          status: 400,
          body: { error: 'unknown_state', description: 'The callback does not match a sign-in this browser started.' },
        })
      }

      const casError = query.get('error')
      if (casError !== null) {
        return refusalResponse(authorizationRefusalOf(casError, query.get('error_description') ?? 'CAS refused the authorization request.'))
      }

      const code = query.get('code')
      // Checked here rather than left to `completeSignIn`, which consumes the pending request *before* it redeems
      // the code: a callback with no code would spend a sign-in this browser could still have completed.
      if (code === null || code === '') {
        return refusalResponse({ status: 400, body: { error: 'sign_in_failed', description: 'The callback carries no authorization code.' } })
      }

      let completed: CompleteSignInResult
      try {
        completed = await completeSignIn(ctx, { code, state })
      } catch (failure) {
        if (!isGrantOver(failure)) {
          throw failure
        }
        // A code already spent, or one issued for another client: the sign-in failed, and it is not CAS being away.
        return refusalResponse({ status: 400, body: { error: 'sign_in_failed', description: failure.message, casError: 'invalid_grant' } })
      }

      // A copy of the parsed `appUrl`, since this redirect may carry a query of its own.
      const target = new URL(appUrl)
      if (completed.previousSub !== null) {
        // The browser was already signed in to CAS as somebody else, so the account was not upgraded: reported for
        // the application to handle explicitly (§9), never merged.
        target.searchParams.set('previous_sub', completed.previousSub)
      }

      const headers = new Headers()
      transport.install(headers, completed.session, now())
      clearStateCookie(headers)
      // A real redirect in both transports: the browser arrived here by navigation, whatever carries the id.
      return redirect(transport.handover(target, completed.session), headers)
    })

  const logout = async (request: Request): Promise<Response> =>
    await handled(async () => {
      const presented = transport.read(request)
      const ended = presented === undefined ? undefined : await endSession(ctx, presented)

      const headers = new Headers()
      transport.uninstall(headers)
      // A sign-in left in flight — the user clicked sign-in, came back to the application tab and logged out —
      // would otherwise still complete from the CAS tab, both of the callback's gates being open, and sign the user
      // back in with a new session, undoing the logout they were told had happened. The pending request is left to
      // its own TTL; nothing is swept here.
      clearStateCookie(headers)
      // Nothing to end — no id, or an id the store does not hold — is still a logout as far as the user is
      // concerned: the browser goes back to the application.
      return transport.navigation(ended?.url ?? appUrl.toString(), headers)
    })

  return { me, signIn, callback, logout }
}
