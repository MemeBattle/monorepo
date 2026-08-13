import { createSelector } from '@reduxjs/toolkit'

import { isDndEnabledSelector, playerStackDeckCardsSelector, playerStackDeckHiddenSelector, playerStackOpenDeckCardsSelector } from '#ducks/game'

export const playerCardsStackSelector = createSelector(
  [playerStackOpenDeckCardsSelector, playerStackDeckCardsSelector, playerStackDeckHiddenSelector, isDndEnabledSelector],
  (stackOpenDeckCards, stackDeckCards, isStackDeckHidden, isDndEnabled) => ({
    stackOpenDeckCard: stackOpenDeckCards?.[stackOpenDeckCards.length - 1],
    stackDeckCards,
    isStackDeckHidden: isStackDeckHidden ?? true,
    isDndEnabled,
  }),
)
