import type { Clock } from './ports/clock.ts'
import type { DatabaseProbe } from './ports/database-probe.ts'

/**
 * The outcome of the health check. A domain type owned by `src/core`: the wire schema of the same shape is declared
 * separately, and `src/http/health.ts` is where the compiler checks one against the other.
 */
export type HealthResult = {
  status: 'ok' | 'unavailable'
  checks: {
    database: { status: 'ok' | 'failed'; durationMs: number; error?: string }
  }
}

type CheckHealthDeps = {
  database: DatabaseProbe
  clock: Clock
  /** How long the database may take to answer before it counts as failed. */
  timeoutMs?: number
}

const TIMEOUT = Symbol('timeout')

/** Builds the health check: pings the database within a timeout. An unreachable database is a result, not a throw. */
export const createCheckHealth =
  ({ database, clock, timeoutMs = 2000 }: CheckHealthDeps) =>
  async (): Promise<HealthResult> => {
    const startedAt = clock.now()
    // Assigned synchronously by the executor below.
    let timer!: ReturnType<typeof setTimeout>
    const timeout = new Promise<typeof TIMEOUT>(resolve => {
      timer = setTimeout(() => resolve(TIMEOUT), timeoutMs)
    })

    let error: string | undefined
    try {
      const outcome = await Promise.race([database.ping(), timeout])
      if (outcome === TIMEOUT) {
        error = 'timeout'
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      // A pending timer would keep a Node process alive after a fast answer.
      clearTimeout(timer)
    }

    const durationMs = Math.max(0, clock.now() - startedAt)
    if (error === undefined) {
      return { status: 'ok', checks: { database: { status: 'ok', durationMs } } }
    }
    return { status: 'unavailable', checks: { database: { status: 'failed', durationMs, error } } }
  }
