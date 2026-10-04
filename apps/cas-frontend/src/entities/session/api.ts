import type { ErrorCodeOf, Result } from '#shared/api/client'
import type { GetMeResponses } from '#shared/api/generated/models/GetMe'
import type { LogoutResponses } from '#shared/api/generated/models/Logout'
import type { MeResponse } from '#shared/api/generated/models/MeResponse'
import type { UpdateMeResponses } from '#shared/api/generated/models/UpdateMe'
import { getMe as getMeOperation } from '#shared/api/generated/operations/getMe'
import { logout as logoutOperation } from '#shared/api/generated/operations/logout'
import { updateMe } from '#shared/api/generated/operations/updateMe'

/** `GET /api/me`: the signed-in account as the dashboard needs it. `sessionExpiresAt` is when the session ends if nothing renews it. */
export type Me = MeResponse

/** The codes `getMe` can fail with. */
export type GetMeErrorCode = ErrorCodeOf<GetMeResponses>

/** The codes `logout` can fail with. */
export type LogoutErrorCode = ErrorCodeOf<LogoutResponses>

/** The codes `updateEmail` can fail with. */
export type UpdateEmailErrorCode = ErrorCodeOf<UpdateMeResponses>

/**
 * Answers `unauthenticated` when the browser holds no live session. Answers a guest too, while the browser holds the
 * upgrade session CAS opened for it (apps/cas ADR 0018): `accountType: 'guest'` is how the app knows it is one. Throws
 * only what is outside the contract: no network, a 5xx, an unreadable body (`ApiError`).
 */
export const getMe = (): Promise<Result<Me, GetMeErrorCode>> => getMeOperation()

/**
 * `POST /api/logout`: ends the session and removes the cookie; a 204 whether
 * or not one was live. `Clear-Site-Data` on the answer empties the cache, so
 * nothing about the account survives on this side. Throws like `getMe`.
 */
export const logout = (): Promise<Result<undefined, LogoutErrorCode>> => logoutOperation()

/**
 * `PATCH /api/me`: sets the account's email, or clears it with `null`; a 204
 * either way, and the same request twice leaves the same account. The server
 * trims the address and lower-cases its domain but does not answer with what
 * it stored, so the caller reads it back through `getMe`. The address is
 * checked for shape only and stays unverified: an empty one, one over 254
 * bytes, one with spaces or invisible characters, without a single `@` with
 * something on both sides, or with a broken domain answers
 * `invalid_email`. Throws like `getMe`.
 */
export const updateEmail = (email: string | null): Promise<Result<undefined, UpdateEmailErrorCode>> => updateMe({ body: { email } })
