import { describe, expect, it } from 'vitest'

import { createRecordingLogger } from '../core/ports/logger.fake.ts'
import type { SweepCounts } from '../core/sweep.ts'
import { runSweep } from './run-sweep.ts'

const COUNTS: SweepCounts = { authRequests: 2, sessions: 1, sessionLocks: 3, failedSessions: 0 }

describe('runSweep', () => {
  it('logs the counts of a clean run and no warning', async () => {
    const { logger, entries } = createRecordingLogger()

    await runSweep({ sweep: () => Promise.resolve(COUNTS), logger })

    expect(entries).toEqual([{ level: 'info', message: 'sweep_completed', fields: { ...COUNTS } }])
  })

  it('warns about the sessions it left', async () => {
    const { logger, entries } = createRecordingLogger()

    await runSweep({ sweep: () => Promise.resolve({ ...COUNTS, failedSessions: 2 }), logger })

    expect(entries.map(entry => entry.message)).toEqual(['sweep_completed', 'sweep_sessions_left'])
    expect(entries[1]).toEqual({ level: 'warn', message: 'sweep_sessions_left', fields: { failedSessions: 2 } })
  })

  it('logs a failure and rethrows the same error', async () => {
    const { logger, entries } = createRecordingLogger()
    const failure = new Error('connection lost')

    await expect(runSweep({ sweep: () => Promise.reject(failure), logger })).rejects.toBe(failure)

    expect(entries).toEqual([{ level: 'error', message: 'sweep_failed', fields: { error: 'connection lost' } }])
  })

  it('logs a rejection that is not an Error as a string', async () => {
    const { logger, entries } = createRecordingLogger()

    await expect(runSweep({ sweep: () => Promise.reject('gone'), logger })).rejects.toBe('gone')

    expect(entries).toEqual([{ level: 'error', message: 'sweep_failed', fields: { error: 'gone' } }])
  })
})
