import { describe, expect, it } from 'vitest'

import { createListLeaders } from './leaders.ts'
import { createFixedClock } from './ports/clock.fake.ts'
import type { Leader } from './ports/leaders-repository.ts'
import { createFakeLeadersRepository } from './ports/leaders-repository.fake.ts'

/** Already 2026-11-15 in Berlin. */
const NOW = Date.UTC(2026, 10, 14, 23, 30)

const leader = (sub: string, points: number, place: number): Leader => ({ sub, displayName: sub, avatarUrl: null, points, place })

const setup = (answer?: { top: Leader[]; viewer: Leader | undefined }) => {
  const leaders = createFakeLeadersRepository(answer)
  const listLeaders = createListLeaders({ leaders, clock: createFixedClock(NOW), limit: 7 })
  return { leaders, listLeaders }
}

describe('listLeaders', () => {
  it.each([
    ['day', { from: '2026-11-15', to: '2026-11-15' }],
    ['month', { from: '2026-10-17', to: '2026-11-15' }],
    ['all', 'all'],
  ] as const)('ranks %s over the window of the Berlin date', async (period, window) => {
    const { leaders, listLeaders } = setup()
    await listLeaders(period, 'viewer-sub')
    expect(leaders.queries).toEqual([{ window, limit: 7, viewer: 'viewer-sub' }])
  })

  it('answers the top as leaders and the viewer row as me', async () => {
    const top = [leader('alice', 10, 1), leader('bob', 5, 2)]
    const { listLeaders } = setup({ top, viewer: top[1] })
    expect(await listLeaders('all', 'bob')).toEqual({ leaders: top, me: top[1] })
  })

  it('answers me: null when the viewer is not ranked', async () => {
    const top = [leader('alice', 10, 1)]
    const { listLeaders } = setup({ top, viewer: undefined })
    expect(await listLeaders('day', 'carol')).toEqual({ leaders: top, me: null })
  })
})
