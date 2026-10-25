import { AuthUserSchema } from '@memebattle/ligretto-auth/schema'
import { z } from 'zod'

import { errorResponseSchema } from './error.ts'

/** The most ids one `GET /api/users` looks up. */
export const MAX_USER_IDS = 100

/**
 * The query of `GET /api/users`: `?ids=a&ids=b`, 1 to 100 values. Hono hands a parameter that appears once over as a
 * string and a repeated one as an array, so a single value is normalised to a one-element array before validation.
 */
export const listUsersQuerySchema = z.object({
  ids: z
    .preprocess(value => (typeof value === 'string' ? [value] : value), z.array(z.string().min(1)).min(1).max(MAX_USER_IDS))
    .meta({
      description: `The CAS subjects to look up, as a repeated parameter (\`?ids=a&ids=b\`), 1 to ${MAX_USER_IDS} values`,
      param: { style: 'form', explode: true },
    }),
})

/**
 * One user as the public API shows it: `AuthUser` of `@memebattle/ligretto-auth`, registered as the named item type of
 * `GET /api/users`. `MeResponse.user` of `/api/auth/me` has the same shape, but the package's route fragment renders it
 * inline, so the document names the type for `/api/users` only.
 */
export const authUserSchema = AuthUserSchema.meta({
  id: 'AuthUser',
  description: 'The account as a page may show it: the snapshot the latest validated ID token gave, nothing of the grant.',
})

export const listUsersResponseSchema = z
  .array(authUserSchema)
  .meta({ description: 'The snapshot of each requested id that has one, in no promised order; unknown ids are absent' })

/** The refusal of `GET /api/users` without a CAS access token this service accepts. */
export const unauthorizedSchema = errorResponseSchema
  .extend({ error: z.literal('unauthorized') })
  .meta({ id: 'Unauthorized', description: 'A valid CAS access token for this service is required' })

/** CAS's metadata could not be read, so the presented access token was never judged. */
export const casUnavailableSchema = errorResponseSchema
  .extend({ error: z.literal('cas_unavailable') })
  .meta({ id: 'CasUnavailable', description: "CAS's metadata could not be read to verify the access token; repeat the request" })

export type ListUsersQuery = z.output<typeof listUsersQuerySchema>
export type ListUsersResponse = z.infer<typeof listUsersResponseSchema>
export type AuthUser = z.infer<typeof authUserSchema>
export type Unauthorized = z.infer<typeof unauthorizedSchema>
export type CasUnavailable = z.infer<typeof casUnavailableSchema>
