import { CardsActions, CardsTypes } from './types'
import * as Store from 'types/store'
import { Card, CardColors, CardPositions } from 'types/entities/card-model'
import sample from 'lodash/sample'
import random from 'lodash/random'

const createRandomCard = (): Card => ({
  color: sample([CardColors.yellow, CardColors.red, CardColors.blue, CardColors.green]),
  value: `${random(1, 9)}`,
  disabled: false,
})

export const createCardsInitialState = (): Store.Cards =>
  Object.values(CardPositions).reduce((acc: Partial<Store.Cards>, cardPosition) => {
    acc[cardPosition] = createRandomCard()
    return acc
  }, {}) as Store.Cards

export const cardsInitialState: Store.Cards = createCardsInitialState()

export const cardsReducer = (state = cardsInitialState, action: CardsActions): Store.Cards => {
  switch (action.type) {
    case CardsTypes.PUSH_CARD:
      return { ...state, [action.payload.cardPosition]: action.payload.card }
    default:
      return state
  }
}
