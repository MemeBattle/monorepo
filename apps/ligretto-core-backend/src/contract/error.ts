import { z } from 'zod'

/** The envelope of every refusal (docs/adrs/error-responses.md); routes extend it with their code-specific fields. */
export const errorResponseSchema = z
  .object({
    error: z.string(),
    description: z.string().optional(),
  })
  .meta({ id: 'ErrorResponse', description: 'A refusal: a stable code and an optional developer description' })

/** A request the route schemas reject, or a body that cannot be parsed. */
export const validationFailedSchema = errorResponseSchema
  .extend({
    error: z.literal('validation_failed'),
    issues: z.array(z.object({ path: z.string(), message: z.string(), code: z.string() })),
  })
  .meta({ id: 'ValidationFailed', description: 'The request does not match the route schema' })

/** The one unhandled failure; `requestId` matches the request's log line. */
export const internalErrorSchema = errorResponseSchema
  .extend({
    error: z.literal('internal_error'),
    requestId: z.string(),
  })
  .meta({ id: 'InternalError', description: 'An unexpected failure; the request id points at its log line' })

export type ErrorResponse = z.infer<typeof errorResponseSchema>
export type ValidationFailed = z.infer<typeof validationFailedSchema>
export type InternalError = z.infer<typeof internalErrorSchema>
