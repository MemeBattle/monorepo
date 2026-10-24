import type { DatabaseProbe } from '../core/ports/database-probe'

/**
 * Always resolves: the service has no database yet. https://github.com/MemeBattle/monorepo/issues/833 replaces it with
 * a probe over the real connection; the route and its report stay the same.
 */
export const stubDatabaseProbe: DatabaseProbe = { ping: () => Promise.resolve() }
