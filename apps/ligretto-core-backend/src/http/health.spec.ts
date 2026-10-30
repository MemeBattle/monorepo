import { describe, expect, it } from 'vitest'

import { healthReportSchema } from '../contract/health.ts'
import { createFixedClock } from '../core/ports/clock.fake.ts'
import type { DatabaseProbe } from '../core/ports/database-probe.ts'
import { failingProbe, okProbe } from '../core/ports/database-probe.fake.ts'
import { createFakeGamesRepository } from '../core/ports/games-repository.fake.ts'
import { createRecordingLogger } from '../core/ports/logger.fake.ts'
import { createFakePublicDeps } from './deps.fake.ts'
import { createInternalApp } from './internal-app.ts'
import { createPublicApp } from './public-app.ts'
import type { InternalAppDeps, PublicAppDeps } from './types.ts'

const deps = (database: DatabaseProbe): InternalAppDeps & PublicAppDeps => ({
  ...createFakePublicDeps(),
  logger: createRecordingLogger().logger,
  clock: createFixedClock(),
  database,
  games: createFakeGamesRepository(),
  internalTokens: ['test-token'],
})

describe.each([
  ['public', createPublicApp],
  ['internal', createInternalApp],
])('GET /health on the %s app', (_name, createApp) => {
  // The body parsing with the contract schema is the run-time proof that the core result and the wire shape agree.
  it('answers 200 with the report when the database answers', async () => {
    const res = await createApp(deps(okProbe())).request('/health')
    expect(res.status).toBe(200)
    const report = healthReportSchema.parse(await res.json())
    expect(report).toEqual({ status: 'ok', checks: { database: { status: 'ok', durationMs: 0 } } })
  })

  it('answers 503 with the report when the database does not', async () => {
    const res = await createApp(deps(failingProbe(new Error('connection refused')))).request('/health')
    expect(res.status).toBe(503)
    const report = healthReportSchema.parse(await res.json())
    expect(report.status).toBe('unavailable')
    expect(report.checks.database.error).toBe('connection refused')
  })
})
