import * as Store from 'types/store'
import { createSelector } from 'reselect'
import { CardPositions } from 'types/entities/card-model'

export const selectCards = (state: Store.All) => state.cards
export const selectCardByPosition = createSelector(
  [selectCards, (_: Store.All, cardPosition: CardPositions) => cardPosition],
  (cards, cardPosition) => cards[cardPosition],
)
