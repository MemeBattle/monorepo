import { Action } from '@memebattle/redux-utils'
import { CardPositions, Card } from '@memebattle/ligretto-shared'
import { dto } from '@memebattle/ligretto-shared'

export enum CardsTypes {
  PUSH_CARDS = '@@cards/PUSH_CARDS',
  TAP_CARD = '@@cards/TAP_CARD',
  TAP_CARD_EMIT = '@@cards/WEBSOCKET/TAP_CARD_EMIT',
}

export type PushCardAction = Action<CardsTypes.PUSH_CARDS, Partial<Record<CardPositions, Card>>>
export type TapCardAction = Action<CardsTypes.TAP_CARD, { cardPosition: CardPositions }>

export type TapCardEmitAction = Action<CardsTypes.TAP_CARD_EMIT, dto.TapCard>

export type CardsActions = PushCardAction | TapCardAction | TapCardEmitAction
