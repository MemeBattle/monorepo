import { z } from 'zod'

import { errorResponseSchema } from './error'

/**
 * The answer of an auth route whose session lock was not granted in time: this service's addition to the codes of
 * `@memebattle/ligretto-auth`, answered where the handlers are mounted (`src/http/auth.ts`).
 */
export const sessionBusySchema = errorResponseSchema
  .extend({ error: z.literal('session_busy') })
  .meta({ id: 'SessionBusy', description: "The session's lock was not granted in time; repeat the request" })

export type SessionBusy = z.infer<typeof sessionBusySchema>
