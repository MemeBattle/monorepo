import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestDatabase } from '../../../test/support/pglite'
import { createCheckHealth } from '../../core/health'
import { createFixedClock } from '../../core/ports/clock.fake'
import { createPgDatabaseProbe } from './probe'

describe('createPgDatabaseProbe', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>

  beforeAll(async () => {
    database = await createTestDatabase()
  })

  afterAll(async () => {
    await database.close()
  })

  it('resolves while the database answers', async () => {
    await expect(createPgDatabaseProbe(database.db).ping()).resolves.toBeUndefined()
  })

  it('rejects once the database is gone, which the health check reports as failed', async () => {
    const probe = createPgDatabaseProbe(database.db)
    await database.db.destroy()
    await expect(probe.ping()).rejects.toThrow()
    const result = await createCheckHealth({ database: probe, clock: createFixedClock() })()
    expect(result.status).toBe('unavailable')
    expect(result.checks.database.status).toBe('failed')
  })
})
