import { describe, expect, it } from 'vitest'

import { createFakeAuthSweepStore } from './ports/auth-sweep-store.fake'
import { createFixedClock } from './ports/clock.fake'
import { createRecordingLogger } from './ports/logger.fake'
import { createSweepExpiredAuth } from './sweep'

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000
/** Far enough along that a whole retention window still leaves positive epochs. */
const NOW = 10 * RETENTION_MS
const PAST_THE_BOUNDARY = NOW - RETENTION_MS - 1

const setup = () => {
  const store = createFakeAuthSweepStore()
  const { logger, entries } = createRecordingLogger()
  const sweep = createSweepExpiredAuth({ store, clock: createFixedClock(NOW), logger, sessionRetentionMs: RETENTION_MS })
  return { store, entries, sweep }
}

describe('createSweepExpiredAuth', () => {
  it('removes an expired request and one expiring exactly now, and keeps a live one', async () => {
    const { store, sweep } = setup()
    store.authRequests.set('long-expired', NOW - 1)
    store.authRequests.set('expired-exactly-now', NOW)
    store.authRequests.set('still-live', NOW + 1)

    const counts = await sweep()

    expect(counts.authRequests).toBe(2)
    expect([...store.authRequests.keys()]).toEqual(['still-live'])
  })

  it('keeps a session for the whole retention past its grant', async () => {
    const { store, sweep } = setup()
    store.sessions.set('within-grace', { sub: 'account-a', grantEndsAt: NOW - 1 })
    store.sessions.set('at-the-boundary', { sub: 'account-b', grantEndsAt: NOW - RETENTION_MS })
    store.sessions.set('past-the-boundary', { sub: 'account-c', grantEndsAt: PAST_THE_BOUNDARY })
    store.sessionLocks.add('at-the-boundary')

    const counts = await sweep()

    expect(counts).toEqual({ authRequests: 0, sessions: 2, sessionLocks: 0, failedSessions: 0 })
    expect([...store.sessions.keys()]).toEqual(['within-grace'])
    expect(store.sessionLocks.size).toBe(0)
  })

  it('counts and logs a candidate it cannot take, and carries on with the rest', async () => {
    const { store, entries, sweep } = setup()
    store.sessions.set('refused', { sub: 'account-a', grantEndsAt: PAST_THE_BOUNDARY })
    store.sessions.set('swept', { sub: 'account-b', grantEndsAt: PAST_THE_BOUNDARY })
    store.authRequests.set('expired', NOW - 1)
    store.refuse.add('refused')

    const counts = await sweep()

    expect(counts).toEqual({ authRequests: 1, sessions: 1, sessionLocks: 0, failedSessions: 1 })
    expect([...store.sessions.keys()]).toEqual(['refused'])
    expect(entries).toEqual([
      {
        level: 'warn',
        message: 'sweep_session_left',
        fields: { sub: 'account-a', error: 'the session lock was not granted within lock_timeout', code: 'session_busy' },
      },
    ])
  })

  it('keeps a session recreated before the re-check', async () => {
    const { store, sweep } = setup()
    store.sessions.set('recreated', { sub: 'account-a', grantEndsAt: PAST_THE_BOUNDARY })
    store.recreate.set('recreated', NOW + RETENTION_MS)

    const counts = await sweep()

    expect(counts.sessions).toBe(0)
    expect(store.sessions.has('recreated')).toBe(true)
  })

  it('reports the orphaned lock rows it removed', async () => {
    const { store, sweep } = setup()
    store.sessions.set('alive', { sub: 'account-a', grantEndsAt: NOW + 1 })
    store.sessionLocks.add('alive')
    store.sessionLocks.add('orphan-a')
    store.sessionLocks.add('orphan-b')

    const counts = await sweep()

    expect(counts.sessionLocks).toBe(2)
    expect([...store.sessionLocks]).toEqual(['alive'])
  })

  it('never logs a session id, only the account', async () => {
    const { store, entries, sweep } = setup()
    store.sessions.set('sess-secret-a', { sub: 'account-a', grantEndsAt: PAST_THE_BOUNDARY })
    store.sessions.set('sess-secret-b', { sub: 'account-b', grantEndsAt: PAST_THE_BOUNDARY })
    store.refuse.add('sess-secret-a')

    await sweep()

    const logged = JSON.stringify(entries)
    expect(logged).not.toContain('sess-secret-a')
    expect(logged).not.toContain('sess-secret-b')
    expect(logged).toContain('account-a')
  })
})
