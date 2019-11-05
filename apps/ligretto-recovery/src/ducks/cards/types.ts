import { Action } from 'types/actions'
import { CardPositions, Card } from 'types/entities/card-model'
import { dto } from '@memebattle/ligretto-shared'

export enum CardsTypes {
  PUSH_CARD = '@@cards/PUSH_CARD',
  TAP_CARD = '@@cards/TAP_CARD',
  TAP_CARD_EMIT = '@@cards/WEBSOCKET/TAP_CARD_EMIT',
}

export type PushCardAction = Action<CardsTypes.PUSH_CARD, { cardPosition: CardPositions; card: Card }>
export type TapCardAction = Action<CardsTypes.TAP_CARD, { cardPosition: CardPositions }>

export type TapCardEmitAction = Action<CardsTypes.TAP_CARD_EMIT, dto.TapCard>

export type CardsActions = PushCardAction | TapCardAction | TapCardEmitAction
