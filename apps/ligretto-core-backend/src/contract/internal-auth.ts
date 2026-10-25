import { z } from 'zod'

import { errorResponseSchema } from './error.ts'

/** The refusal of every internal route without a configured `Authorization: Bearer` token. */
export const invalidInternalTokenSchema = errorResponseSchema
  .extend({ error: z.literal('invalid_internal_token') })
  .meta({ id: 'InvalidInternalToken', description: 'A valid Authorization: Bearer token for the internal API is required' })

export type InvalidInternalToken = z.infer<typeof invalidInternalTokenSchema>
