import { createSelector } from '@reduxjs/toolkit'

import { isDndEnabledSelector, playerStackDeckCardsSelector, playerStackOpenDeckCardsSelector, selectedCardIndexSelector } from '#ducks/game'

export const playerCardsStackSelector = createSelector(
  [playerStackOpenDeckCardsSelector, playerStackDeckCardsSelector, isDndEnabledSelector, selectedCardIndexSelector],
  (stackOpenDeckCards, stackDeckCards, isDndEnabled, selectedCardIndex) => ({
    stackOpenDeckCard: stackOpenDeckCards?.[stackOpenDeckCards.length - 1],
    stackDeckCards,
    isDndEnabled,
    selectedCardIndex,
  }),
)
