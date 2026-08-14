import { createSelector } from '@reduxjs/toolkit'

import { playerStackDeckCardsSelector, playerStackDeckHiddenSelector, playerStackOpenDeckCardsSelector } from '#ducks/game'

export const playerCardsStackSelector = createSelector(
  [playerStackOpenDeckCardsSelector, playerStackDeckCardsSelector, playerStackDeckHiddenSelector],
  (stackOpenDeckCards, stackDeckCards, isStackDeckHidden) => ({
    stackOpenDeckCard: stackOpenDeckCards?.[stackOpenDeckCards.length - 1],
    stackDeckCards,
    isStackDeckHidden: isStackDeckHidden ?? true,
  }),
)
