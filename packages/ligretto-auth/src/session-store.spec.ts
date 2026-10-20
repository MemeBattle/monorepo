import { describe, expect, it } from 'vitest'
import type { PendingAuthorizationRequest, Session } from './session-store'
import { createInMemorySessionStore } from './session-store'
import { gate } from './test-support/cas'

const START = 1_793_000_000_000

/** A clock a test moves by hand, so an expiry is reached without waiting for it. */
const clock = (start = START) => {
  let value = start
  return { now: () => value, advance: (ms: number) => void (value += ms) }
}

const sessionWith = (id: string, overrides: Partial<Session> = {}): Session => ({
  id,
  sub: 'a-subject',
  accountType: 'guest',
  displayName: null,
  avatarUrl: null,
  refreshToken: 'a-refresh-token',
  accessToken: 'an-access-token',
  accessTokenExpiresAt: START + 600_000,
  grantEndsAt: START + 30 * 24 * 60 * 60 * 1000,
  idToken: 'an-id-token',
  createdAt: START,
  ...overrides,
})

const pendingWith = (state: string, overrides: Partial<PendingAuthorizationRequest> = {}): PendingAuthorizationRequest => ({
  state,
  codeVerifier: 'a-verifier',
  nonce: 'a-nonce',
  sessionId: null,
  sub: null,
  expiresAt: START + 60 * 60 * 1000,
  ...overrides,
})

describe('the sessions of the in-memory store', () => {
  it('upserts by id, reads back and deletes', async () => {
    const store = createInMemorySessionStore()
    await store.saveSession(sessionWith('session-1'))
    await store.saveSession(sessionWith('session-1', { accountType: 'full', displayName: 'Ada' }))

    await expect(store.getSession('session-1')).resolves.toMatchObject({ accountType: 'full', displayName: 'Ada' })

    await store.deleteSession('session-1')
    await expect(store.getSession('session-1')).resolves.toBeUndefined()
  })
})

describe('withSessionLock', () => {
  it('runs two holders of one id strictly one after the other', async () => {
    const store = createInMemorySessionStore()
    const order: string[] = []
    const first = gate()

    const held = store.withSessionLock('session-1', async () => {
      order.push('first in')
      await first.promise
      order.push('first out')
    })
    const queued = store.withSessionLock('session-1', async () => void order.push('second in'))

    // The second holder is waiting, not running: the first still has the lock.
    await Promise.resolve()
    expect(order).toEqual(['first in'])

    first.release()
    await Promise.all([held, queued])
    expect(order).toEqual(['first in', 'first out', 'second in'])
  })

  it('lets another id run while one is held', async () => {
    const store = createInMemorySessionStore()
    const order: string[] = []
    const first = gate()

    const held = store.withSessionLock('session-1', async () => {
      order.push('session-1 in')
      await first.promise
      order.push('session-1 out')
    })
    await store.withSessionLock('session-2', async () => void order.push('session-2'))

    expect(order).toEqual(['session-1 in', 'session-2'])
    first.release()
    await held
  })

  it('releases the lock when the holder throws', async () => {
    const store = createInMemorySessionStore()
    const order: string[] = []

    const failing = store.withSessionLock('session-1', async () => {
      order.push('failing')
      throw new Error('boom')
    })
    const queued = store.withSessionLock('session-1', async () => {
      order.push('next')
      return 'done'
    })

    await expect(failing).rejects.toThrow('boom')
    await expect(queued).resolves.toBe('done')
    expect(order).toEqual(['failing', 'next'])
  })

  it('locks an id whose session does not exist, which is what a writer deciding about a deleted one takes', async () => {
    const store = createInMemorySessionStore()

    await expect(store.withSessionLock('never-stored', async () => await store.getSession('never-stored'))).resolves.toBeUndefined()
  })
})

describe('the pending authorization requests of the in-memory store', () => {
  it('consumes a request exactly once', async () => {
    const store = createInMemorySessionStore()
    await store.savePendingRequest(pendingWith('the-state', { sessionId: 'session-1', sub: 'a-subject' }))

    await expect(store.takePendingRequest('the-state')).resolves.toMatchObject({ sessionId: 'session-1', sub: 'a-subject' })
    await expect(store.takePendingRequest('the-state')).resolves.toBeUndefined()
  })

  it('answers nothing for a state it never stored', async () => {
    const store = createInMemorySessionStore()

    await expect(store.takePendingRequest('a-state')).resolves.toBeUndefined()
  })

  it('answers nothing for an expired request, and consumes it all the same', async () => {
    const time = clock()
    const store = createInMemorySessionStore({ now: time.now })
    await store.savePendingRequest(pendingWith('the-state', { expiresAt: START + 1000 }))

    time.advance(1000)
    await expect(store.takePendingRequest('the-state')).resolves.toBeUndefined()
  })
})
