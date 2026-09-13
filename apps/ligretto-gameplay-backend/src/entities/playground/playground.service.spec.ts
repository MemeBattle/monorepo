import { describe, expect, it, vi } from 'vitest'
import { CardColors } from '@memebattle/ligretto-shared'

import { PlaygroundService } from './playground.service'

describe('PlaygroundService', () => {
  it('does not select a playground deck when no deck position is provided', () => {
    const service = new PlaygroundService()
    Reflect.set(service, 'playgroundRepository', {
      getDecks: () => [null],
    })

    expect(service.checkIsDeckAvailable('game', { color: CardColors.red, value: 1 }, undefined as never)).toBe(false)
  })

  it.each([
    ['string', '0'],
    ['null', null],
    ['fractional', 0.5],
    ['negative', -1],
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
  ])('rejects a %s deck position before indexed repository access', (_description, deckPosition) => {
    const service = new PlaygroundService()
    const getDeck = vi.fn()
    const getDecks = vi.fn(() => [null])
    Reflect.set(service, 'playgroundRepository', { getDeck, getDecks })

    expect(service.checkIsDeckAvailable('game', { color: CardColors.red, value: 1 }, deckPosition as never)).toBe(false)
    expect(getDeck).not.toHaveBeenCalled()
    expect(getDecks).not.toHaveBeenCalled()
  })

  it('rejects an out-of-range deck position before indexed repository access', () => {
    const service = new PlaygroundService()
    const getDeck = vi.fn()
    const getDecks = vi.fn(() => [null])
    Reflect.set(service, 'playgroundRepository', { getDeck, getDecks })

    expect(service.checkIsDeckAvailable('game', { color: CardColors.red, value: 1 }, 1)).toBe(false)
    expect(getDeck).not.toHaveBeenCalled()
  })
})
