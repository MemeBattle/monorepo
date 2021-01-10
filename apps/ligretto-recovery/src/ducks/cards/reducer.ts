import type { CardsActions } from './types'
import { CardsTypes } from './types'
import type { Card } from '@memebattle/ligretto-shared'
import { CardColors, CardPositions } from '@memebattle/ligretto-shared'
import sample from 'lodash/sample'
import random from 'lodash/random'

export type CardsState = {
  [key in CardPositions]: Card
}

const createRandomCard = (): Card => ({
  color: sample([CardColors.yellow, CardColors.red, CardColors.blue, CardColors.green]),
  value: random(1, 9),
  disabled: false,
})

export const createCardsInitialState = (): CardsState =>
  Object.values(CardPositions).reduce((acc: Partial<CardsState>, cardPosition) => {
    acc[cardPosition] = createRandomCard()
    return acc
  }, {}) as CardsState

export const cardsInitialState: CardsState = createCardsInitialState()

export const cardsReducer = (state = cardsInitialState, action: CardsActions): CardsState => {
  switch (action.type) {
    case CardsTypes.PUSH_CARDS:
      return { ...state, ...action.payload }
    default:
      return state
  }
}
