import { createRoute } from '@hono/zod-openapi'

import { createCheckHealth } from '../core/health'
import { healthReportSchema, type HealthReport } from '../contract/health'
import type { BaseApp } from './app'
import type { AppDeps } from './types'

export const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  operationId: 'getHealth',
  summary: 'Whether the service and its database answer',
  responses: {
    200: { description: 'Every check passed', content: { 'application/json': { schema: healthReportSchema } } },
    503: { description: 'A check failed; the report says which', content: { 'application/json': { schema: healthReportSchema } } },
  },
})

/**
 * `GET /health`. Here the core's `HealthResult` meets the contract's `HealthReport`: the typed route constrains
 * `c.json` by the schema, and `satisfies` makes the check explicit, so the two shapes cannot drift apart unnoticed.
 */
export const registerHealth = (app: BaseApp, deps: AppDeps) => {
  const checkHealth = createCheckHealth({ database: deps.database, clock: deps.clock })
  app.openapi(healthRoute, async c => {
    const report = await checkHealth()
    return report.status === 'ok' ? c.json(report satisfies HealthReport, 200) : c.json(report satisfies HealthReport, 503)
  })
}
