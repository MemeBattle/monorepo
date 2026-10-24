/**
 * What the handlers of `./handlers` answer, as types alone: derived from the schemas of `./schema` with `z.infer`, and
 * imported with `import type` only, so this module is erased from whatever bundles it and carries nothing a browser
 * must not hold — no client secret, no `fetch`, no zod, no code at all.
 *
 * It is the package's second entry, `@memebattle/ligretto-auth/contract`, so a frontend types its calls against the
 * same declaration the backend answers from instead of a copy that drifts. The rest of the package stays server-only.
 * The field documentation lives on the schemas, where the OpenAPI document picks it up.
 */

import type { z } from 'zod'
import type { AccountType } from './generated/models/AccountType'
import type {
  AuthErrorCodeSchema,
  AuthErrorResponseSchema,
  AuthUserSchema,
  CallbackQuerySchema,
  MeResponseSchema,
  NavigationResponseSchema,
} from './schema'

export type { AccountType }

/** The account as a page may show it; `AuthUserSchema`. */
export type AuthUser = z.infer<typeof AuthUserSchema>

/** The answer of `GET me`; `MeResponseSchema`. */
export type MeResponse = z.infer<typeof MeResponseSchema>

/** Where the browser is to navigate, in the `bearer` transport; `NavigationResponseSchema`. */
export type NavigationResponse = z.infer<typeof NavigationResponseSchema>

/** Why a handler refused, as a union of literals; `AuthErrorCodeSchema`. */
export type AuthErrorCode = z.infer<typeof AuthErrorCodeSchema>

/** A handler's refusal, as JSON; `AuthErrorResponseSchema`. */
export type AuthErrorResponse = z.infer<typeof AuthErrorResponseSchema>

/** The query CAS sends the browser back to the callback with; `CallbackQuerySchema`. */
export type CallbackQuery = z.infer<typeof CallbackQuerySchema>
