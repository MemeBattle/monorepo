import { describe, expect, it } from 'vitest'
import { putCardAction, putCardFromStackOpenDeck } from '@memebattle/ligretto-shared'

import { getCardPlacementAction } from './getCardPlacementAction'

describe('getCardPlacementAction', () => {
  it('builds an explicit row-card placement command', () => {
    expect(getCardPlacementAction({ type: 'row', index: 3 }, 'game', 7)).toEqual(
      putCardAction({ gameId: 'game', cardIndex: 3, playgroundDeckIndex: 7 }),
    )
  })

  it('builds an explicit open-stack placement command', () => {
    expect(getCardPlacementAction({ type: 'open-stack' }, 'game', 4)).toEqual(putCardFromStackOpenDeck({ gameId: 'game', playgroundDeckIndex: 4 }))
  })
})
