import { request } from '#shared/api/request'

/** `GET /api/me`: the signed-in account as the dashboard needs it. */
export interface Me {
  accountId: string
  displayName: string
  accountType: 'full' | 'guest'
  email: string | null
  /** RFC 3339; when the session ends if nothing renews it. */
  sessionExpiresAt: string
}

/** Throws `ApiError` with the code `unauthenticated` when the browser holds no live session. */
export const getMe = () => request<Me>('/api/me')

/**
 * `POST /api/logout`: ends the session and removes the cookie; a 204 whether
 * or not one was live. `Clear-Site-Data` on the answer empties the cache, so
 * nothing about the account survives on this side.
 */
export const logout = () => request<void>('/api/logout', { method: 'POST' })

/**
 * `PATCH /api/me`: sets the account's email, or clears it with `null`; a 204
 * either way, and the same request twice leaves the same account. The server
 * trims the address and lower-cases its domain but does not answer with what
 * it stored, so the caller reads it back through `getMe`. The address is
 * checked for shape only and stays unverified: an empty one, one over 254
 * bytes, one with spaces or invisible characters, without a single `@` with
 * something on both sides, or with a broken domain is `ApiError`
 * `invalid_email`.
 */
export const updateEmail = (email: string | null): Promise<void> => request<void>('/api/me', { method: 'PATCH', body: { email } })
