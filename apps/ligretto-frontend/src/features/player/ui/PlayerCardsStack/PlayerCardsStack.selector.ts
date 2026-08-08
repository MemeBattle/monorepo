import { createSelector } from '@reduxjs/toolkit'

import {
  isDndEnabledSelector,
  playerStackDeckCardsSelector,
  playerStackDeckHiddenSelector,
  playerStackOpenDeckCardsSelector,
  selectedCardIndexSelector,
} from '#ducks/game'

export const playerCardsStackSelector = createSelector(
  [playerStackOpenDeckCardsSelector, playerStackDeckCardsSelector, playerStackDeckHiddenSelector, isDndEnabledSelector, selectedCardIndexSelector],
  (stackOpenDeckCards, stackDeckCards, isStackDeckHidden, isDndEnabled, selectedCardIndex) => ({
    stackOpenDeckCard: stackOpenDeckCards?.[stackOpenDeckCards.length - 1],
    stackDeckCards,
    isStackDeckHidden: isStackDeckHidden ?? true,
    isDndEnabled,
    selectedCardIndex,
  }),
)
