import type { DatabaseProbe } from './database-probe.ts'

export const okProbe = (): DatabaseProbe => ({ ping: () => Promise.resolve() })

export const failingProbe = (error: Error): DatabaseProbe => ({ ping: () => Promise.reject(error) })

/** A database that never answers, for the timeout path. */
export const hangingProbe = (): DatabaseProbe => ({ ping: () => new Promise<void>(() => {}) })
