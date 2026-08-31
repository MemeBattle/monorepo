import { putCardAction, putCardFromStackOpenDeck } from '@memebattle/ligretto-shared'

import type { CardPlacementTarget } from './types'

export const getCardPlacementAction = (target: CardPlacementTarget, gameId: string, playgroundDeckIndex: number) =>
  target.type === 'row'
    ? putCardAction({ cardIndex: target.index, gameId, playgroundDeckIndex })
    : putCardFromStackOpenDeck({ gameId, playgroundDeckIndex })
