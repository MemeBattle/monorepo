import type { DatabaseProbe } from '../../core/ports/database-probe.ts'
import type { Database } from './database.ts'

/** The health check's probe: a constant select through the builder. The timeout is the health check's (src/core/health.ts). */
export const createPgDatabaseProbe = (db: Database): DatabaseProbe => ({
  ping: async () => {
    await db.selectNoFrom(eb => [eb.lit(1).as('one')]).execute()
  },
})
