import { CardsActions, CardsTypes } from './types'
import * as Store from 'types/store'
import { CardPositions, CardColors, Card } from 'types/entities/card-model'

const defaultCard: Card = {
  color: CardColors.red,
  disabled: false,
  value: '9',
}

export const createCardsInitialState = (): Store.Cards =>
  Object.values(CardPositions).reduce((acc, cardPosition) => ({ ...acc, [cardPosition]: defaultCard }), {}) as Store.Cards

export const cardsInitialState: Store.Cards = createCardsInitialState()

export const cardsReducer = (state = cardsInitialState, action: CardsActions): Store.Cards => {
  switch (action.type) {
    case CardsTypes.PUSH_CARD:
      return { ...state, [action.payload.cardPosition]: action.payload.card }
    default:
      return state
  }
}
