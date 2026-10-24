/**
 * How the session id travels between the browser and the handlers of `./handlers`, as one small port with two
 * implementations: everything else about a route is the same in both.
 *
 * `cookie` is the ordinary deployment — the frontend is served from the same site as the handlers, so a `__Host-`
 * cookie carries the id and the browser navigates to `sign-in` and `logout` itself. `bearer` is for a frontend that
 * keeps the id in storage of its own: it travels in `Authorization: Bearer`, which a navigation cannot set, so those
 * two routes are fetched and answer the URL to navigate to instead of a redirect. The id never appears in a query
 * parameter in either transport — it is a long-lived reusable credential, and an abandoned sign-in does not retire
 * it, so a copy left in a URL or a server log stays usable.
 *
 * The `state` cookie is shared: §4 wants the callback's `state` compared with a value stored *for this browser*, and
 * the callback is a top-level navigation to the handlers' own origin in both transports, so a host-only `SameSite=Lax`
 * cookie reaches it even when the application's page is cross-origin.
 */

import type { NavigationResponse } from './contract'
import type { Session } from './session-store'
import { PENDING_REQUEST_TTL_MS } from './sessions'

/** Which way the session id travels, chosen per deployment. */
export type SessionTransportKind = 'cookie' | 'bearer'

/** The default name of the session cookie. `__Host-` is required of any replacement (ADR 0013 on cookie prefixes). */
export const SESSION_COOKIE_NAME = '__Host-ligretto_session'

/** The cookie that binds a callback's `state` to the browser that started the sign-in (§4). */
export const STATE_COOKIE_NAME = '__Host-ligretto_auth_state'

/** The prefix every cookie here carries: the browser then enforces host-only, `Secure` and `Path=/`. */
const HOST_PREFIX = '__Host-'

/**
 * How much longer than its grant the session cookie lives.
 *
 * The cookie deliberately outlives `grantEndsAt`: a cookie that died with the grant would stop being sent,
 * and the first visit afterwards would be indistinguishable from a new visitor's — so a user whose grant ran out
 * could never be told they had been signed out. Within the grace the stale id is still presented, the refresh is
 * answered `invalid_grant`, the session is deleted and `signedOut` reports it once. Past the grace the user is a
 * plain new visitor, which no cookie lifetime can avoid.
 *
 * A session row must therefore outlive its grant by at least as much, or the id has nothing to be refused against:
 * a store's cleanup job keeps rows until `grantEndsAt + SESSION_COOKIE_GRACE_MS`.
 */
export const SESSION_COOKIE_GRACE_MS = 7 * 24 * 60 * 60 * 1000

/** The attributes of both cookies: host-only, unreadable by script, and sent on the top-level callback navigation. */
const COOKIE_ATTRIBUTES = 'HttpOnly; Secure; Path=/; SameSite=Lax'

/**
 * The cookies a request carries. A minimal parser rather than a dependency: every value this package sets is
 * base64url, so splitting on `;` and the first `=` is the whole of it, and a value it did not set is never read.
 */
export const cookiesOf = (header: string | null): Map<string, string> => {
  const cookies = new Map<string, string>()
  for (const pair of (header ?? '').split(';')) {
    const separator = pair.indexOf('=')
    if (separator === -1) {
      continue
    }
    const name = pair.slice(0, separator).trim()
    if (name !== '') {
      cookies.set(name, pair.slice(separator + 1).trim())
    }
  }
  return cookies
}

const cookieOf = (request: Request, name: string): string | undefined => {
  const value = cookiesOf(request.headers.get('cookie')).get(name)
  return value === undefined || value === '' ? undefined : value
}

const setCookie = (name: string, value: string, maxAgeSeconds: number): string => `${name}=${value}; ${COOKIE_ATTRIBUTES}; Max-Age=${maxAgeSeconds}`

/** Seconds a session cookie is given: to the end of the grant, plus the grace, and never negative. */
export const sessionCookieMaxAge = (session: Session, at: number): number =>
  Math.max(0, Math.ceil((session.grantEndsAt + SESSION_COOKIE_GRACE_MS - at) / 1000))

/**
 * The session id an `Authorization` header presents. The scheme is matched case-insensitively — RFC 6750 §2.1 makes
 * it a case-insensitive token, and this repository follows it (ADR 0013 (d)) — while the id itself is passed through
 * verbatim, because it is base64url and its case is part of it. Another scheme, or no header, is no session.
 */
export const bearerSessionIdOf = (request: Request): string | undefined => {
  const header = request.headers.get('authorization')
  if (header === null) {
    return undefined
  }
  const separator = header.indexOf(' ')
  if (separator === -1 || header.slice(0, separator).toLowerCase() !== 'bearer') {
    return undefined
  }
  const id = header.slice(separator + 1).trim()
  return id === '' ? undefined : id
}

/** The `state` the browser was given when it started this sign-in, or `undefined` when it presents none. */
export const stateCookieOf = (request: Request): string | undefined => cookieOf(request, STATE_COOKIE_NAME)

/** The `state` cookie, living no longer than the pending request it names. */
export const setStateCookie = (headers: Headers, state: string): void =>
  void headers.append('Set-Cookie', setCookie(STATE_COOKIE_NAME, state, Math.floor(PENDING_REQUEST_TTL_MS / 1000)))

/** Takes the `state` cookie back: the sign-in it named is over, whether it completed or was refused. */
export const clearStateCookie = (headers: Headers): void => void headers.append('Set-Cookie', setCookie(STATE_COOKIE_NAME, '', 0))

/** What a handler needs of the way the session id travels, and the only thing the two transports disagree about. */
export interface SessionTransport {
  /** The session id this request presents, or `undefined` for none. */
  read(request: Request): string | undefined
  /** Installs a session on an answer. The bearer transport installs nothing: the id goes in the body or the fragment. */
  install(headers: Headers, session: Session, at: number): void
  /** Takes the session off the browser, for a logout and for an id the store does not hold. */
  uninstall(headers: Headers): void
  /** The session id as the `me` answer carries it: the bearer transport's only way of handing a new id over. */
  inBody(session: Session): string | undefined
  /**
   * Where the callback sends the browser once the sign-in is done, with the new session id where this transport hands
   * it over. The bearer transport uses the URL *fragment*, which browsers never send to a server and never log.
   */
  handover(appUrl: URL, session: Session): string
  /**
   * How `sign-in` and `logout` answer. The cookie transport redirects, since the browser navigated here; the bearer
   * transport was fetched — a navigation cannot carry the header — so it answers the URL for the caller to navigate.
   */
  navigation(url: string, headers: Headers): Response
}

export interface SessionTransportOptions {
  /** The session cookie's name in the `cookie` transport; `__Host-` prefixed. Ignored by the `bearer` one. */
  cookieName?: string
}

const noStore = (headers: Headers): Headers => {
  headers.set('Cache-Control', 'no-store')
  return headers
}

/** A `302` to `url`, keeping whatever the caller already put on `headers` — the cookies it is installing. */
export const redirect = (url: string, headers: Headers): Response => {
  headers.set('Location', url)
  return new Response(null, { status: 302, headers: noStore(headers) })
}

const cookieTransport = (name: string): SessionTransport => ({
  read: request => cookieOf(request, name),
  install: (headers, session, at) => void headers.append('Set-Cookie', setCookie(name, session.id, sessionCookieMaxAge(session, at))),
  uninstall: headers => void headers.append('Set-Cookie', setCookie(name, '', 0)),
  inBody: () => undefined,
  handover: appUrl => appUrl.toString(),
  navigation: redirect,
})

const bearerTransport = (): SessionTransport => ({
  read: bearerSessionIdOf,
  install: () => undefined,
  uninstall: () => undefined,
  inBody: session => session.id,
  handover: (appUrl, session) => {
    // The fragment, not the query: it is never sent to a server and never written to a log, and the frontend reads it
    // off `location.hash` and replaces the history entry.
    appUrl.hash = `session_id=${session.id}`
    return appUrl.toString()
  },
  navigation: (url, headers) => {
    headers.set('Content-Type', 'application/json')
    const body: NavigationResponse = { url }
    return new Response(JSON.stringify(body), { status: 200, headers: noStore(headers) })
  },
})

/**
 * The transport named, with its cookie name checked.
 *
 * A session cookie without the `__Host-` prefix is refused rather than accepted quietly: the prefix is what makes the
 * browser enforce `Secure`, `Path=/` and host-only, so a name that drops it silently weakens the session cookie of
 * every deployment that sets it.
 */
export const createSessionTransport = (
  kind: SessionTransportKind,
  { cookieName = SESSION_COOKIE_NAME }: SessionTransportOptions = {},
): SessionTransport => {
  if (!cookieName.startsWith(HOST_PREFIX)) {
    throw new TypeError(
      `The session cookie name must start with ${HOST_PREFIX}, which is what binds it to this host; got ${JSON.stringify(cookieName)}.`,
    )
  }
  return kind === 'cookie' ? cookieTransport(cookieName) : bearerTransport()
}
