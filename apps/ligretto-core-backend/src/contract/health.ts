import { z } from 'zod'

export const healthReportSchema = z
  .object({
    status: z.enum(['ok', 'unavailable']),
    checks: z.object({
      database: z.object({
        status: z.enum(['ok', 'failed']),
        durationMs: z.number().int().nonnegative(),
        error: z.string().optional(),
      }),
    }),
  })
  .meta({ id: 'HealthReport', description: 'The health check report; the body of both the 200 and the 503 of GET /health' })

export type HealthReport = z.infer<typeof healthReportSchema>
