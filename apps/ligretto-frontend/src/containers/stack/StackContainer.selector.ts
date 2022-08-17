import { createSelector } from 'reselect'

import { isDndEnabledSelector, playerStackDeckCardsSelector, playerStackOpenDeckCardsSelector, selectedCardIndexSelector } from 'ducks/game'

export const stackContainerSelector = createSelector(
  [playerStackOpenDeckCardsSelector, playerStackDeckCardsSelector, isDndEnabledSelector, selectedCardIndexSelector],
  (stackOpenDeckCards, stackDeckCards, isDndEnabled, selectedCardIndex) => ({
    stackOpenDeckCard: stackOpenDeckCards?.[stackOpenDeckCards.length - 1],
    stackDeckCards,
    isDndEnabled,
    selectedCardIndex,
  }),
)
