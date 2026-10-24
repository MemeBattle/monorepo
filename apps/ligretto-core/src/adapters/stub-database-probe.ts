import type { DatabaseProbe } from '../core/ports/database-probe'

/**
 * Always answers: the service has no database yet. Replaced by the probe over the real connection in
 * https://github.com/MemeBattle/monorepo/issues/833; the route and its report do not change.
 */
export const stubDatabaseProbe: DatabaseProbe = { ping: () => Promise.resolve() }
