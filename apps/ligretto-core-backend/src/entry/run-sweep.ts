import type { Logger } from '../core/ports/logger.ts'
import type { SweepCounts } from '../core/sweep.ts'

/**
 * One sweep with its log lines, shared by the Node entry and the Worker's `scheduled` handler. A failure is logged and
 * rethrown: it sets the exit code of the former and marks the cron invocation as an exception in the latter.
 */
export const runSweep = async ({ sweep, logger }: { sweep: () => Promise<SweepCounts>; logger: Logger }): Promise<void> => {
  try {
    const counts = await sweep()
    logger.info('sweep_completed', { ...counts })
    if (counts.failedSessions > 0) {
      logger.warn('sweep_sessions_left', { failedSessions: counts.failedSessions })
    }
  } catch (failure) {
    logger.error('sweep_failed', { error: failure instanceof Error ? failure.message : String(failure) })
    throw failure
  }
}
