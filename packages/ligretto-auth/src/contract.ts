/**
 * What the handlers of `./handlers` answer, as types alone: `export type` only, so this module is erased from
 * whatever bundles it and carries nothing a browser must not hold — no client secret, no `fetch`, no code at all.
 *
 * It is the package's second entry, `@memebattle/ligretto-auth/contract`, so a frontend types its calls against the
 * same declaration the backend answers from instead of a copy that drifts. The rest of the package stays server-only.
 */

import type { AccountType } from './generated/models/AccountType'

export type { AccountType }

/** The account as a page may show it: the snapshot the latest validated ID token gave, nothing of the grant. */
export interface AuthUser {
  /** The account id, stable across a guest upgrade. Application data is keyed on it (§8). */
  sub: string
  accountType: AccountType
  /** The display name, `null` for a guest and for a full account that has none. */
  name: string | null
  avatarUrl: string | null
}

/** The answer of `GET me`: who the user is, and the access token to call this application's own API with. */
export interface MeResponse {
  user: AuthUser
  accessToken: string
  /** When the access token expires, epoch milliseconds: what a refresh timer in the browser is scheduled from. */
  expiresAt: number
  /**
   * `true` when a full account's grant had ended and the guest in this answer replaced it: the user was signed in
   * and is not any more, so the UI offers a sign-in rather than silently showing a guest. `false` for every other
   * answer, a guest whose own grant ended included — there was nothing to sign out of.
   */
  signedOut: boolean
  /** The session id, in the `bearer` transport only: the cookie transport never puts it in a body. */
  sessionId?: string
}

/**
 * Where the browser is to navigate, for a route the `bearer` transport cannot answer with a redirect: the session id
 * travels in a header, which a navigation cannot set, so `sign-in` and `logout` are fetched and the navigation is
 * the caller's. The `cookie` transport answers these routes `302` and never this.
 */
export interface NavigationResponse {
  url: string
}

/** Why a handler refused. Stable: a caller branches on it, and 500 is never one of these — it is the unhandled. */
export type AuthErrorCode =
  /** The callback carries no `state` this browser started a sign-in with, or one that has expired or been used. */
  | 'unknown_state'
  /** The sign-in itself failed: no code came back, the code was spent, or CAS refused the request (400). */
  | 'sign_in_failed'
  /** CAS is rate-limiting this client; `Retry-After` carries the delay to wait out (429). */
  | 'rate_limit_exceeded'
  /** CAS, or whatever answered in its place, cannot be used right now. Transient; try again (503). */
  | 'cas_unavailable'
  /** CAS refused this client's registration or the shape of its request. Not transient: an operator must act (503). */
  | 'cas_rejected'

/** A handler's refusal, as JSON. */
export interface AuthErrorResponse {
  error: AuthErrorCode
  /** For the developer and the logs; a caller branches on `error`. */
  description?: string
  /** The code CAS itself named, when the refusal came from CAS. */
  casError?: string
}
