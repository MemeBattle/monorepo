import last from 'lodash/last'

import { playerCardsSelector, playerStackOpenDeckCardsSelector, playgroundDecksSelector } from '#ducks/game'
import type { All } from '#types/store'
import type { CardInteractionTarget } from './types'

export const cardByInteractionTarget = (state: All, target?: CardInteractionTarget) => {
  switch (target?.type) {
    case 'row':
      return playerCardsSelector(state)?.[target.index]
    case 'open-stack':
      return last(playerStackOpenDeckCardsSelector(state))
    case 'playground':
      return last(playgroundDecksSelector(state)[target.index]?.cards)
  }
}
