import { Action } from 'types/actions'
import { CardPositions, Card } from 'types/entities/card-model'

export enum CardsTypes {
  PUSH_CARD = '@@cards/PUSH_CARD',
  TAP_CARD = '@@cards/TAP_CARD',
}

export type PushCardAction = Action<CardsTypes.PUSH_CARD, { cardPosition: CardPositions; card: Card }>
export type TapCardAction = Action<CardsTypes.TAP_CARD, { cardPosition: CardPositions }>

export type CardsActions = PushCardAction | TapCardAction
