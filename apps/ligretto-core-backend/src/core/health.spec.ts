import { afterEach, describe, expect, it, vi } from 'vitest'

import { createCheckHealth } from './health.ts'
import { createFixedClock } from './ports/clock.fake.ts'
import type { DatabaseProbe } from './ports/database-probe.ts'
import { failingProbe, hangingProbe, okProbe } from './ports/database-probe.fake.ts'

/** A probe that moves the clock while the database "answers", so the duration is measurable. */
const slow = (probe: DatabaseProbe, clock: ReturnType<typeof createFixedClock>, ms: number): DatabaseProbe => ({
  ping: () => {
    clock.advance(ms)
    return probe.ping()
  },
})

describe('createCheckHealth', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports ok with the duration when the database answers', async () => {
    const clock = createFixedClock(1000)
    const checkHealth = createCheckHealth({ database: slow(okProbe(), clock, 7), clock })
    expect(await checkHealth()).toEqual({ status: 'ok', checks: { database: { status: 'ok', durationMs: 7 } } })
  })

  it('reports unavailable with the message when the database refuses', async () => {
    const clock = createFixedClock()
    const checkHealth = createCheckHealth({ database: failingProbe(new Error('connection refused')), clock })
    expect(await checkHealth()).toEqual({
      status: 'unavailable',
      checks: { database: { status: 'failed', durationMs: 0, error: 'connection refused' } },
    })
  })

  it('reports a timeout when the database does not answer, and leaves no timer behind', async () => {
    vi.useFakeTimers()
    const clock = createFixedClock()
    const checkHealth = createCheckHealth({ database: hangingProbe(), clock, timeoutMs: 5 })
    const pending = checkHealth()
    await vi.advanceTimersByTimeAsync(5)
    expect(await pending).toEqual({ status: 'unavailable', checks: { database: { status: 'failed', durationMs: 0, error: 'timeout' } } })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears its timer after a fast answer', async () => {
    vi.useFakeTimers()
    const clock = createFixedClock()
    await createCheckHealth({ database: okProbe(), clock })()
    expect(vi.getTimerCount()).toBe(0)
  })
})
