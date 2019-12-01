import { createAction } from '@memebattle/redux-utils'
import { CardsTypes, PushCardAction, TapCardAction, TapCardEmitAction } from './types'

export const pushCardAction = createAction<PushCardAction>(CardsTypes.PUSH_CARD)
export const tapCardAction = createAction<TapCardAction>(CardsTypes.TAP_CARD)
export const tapCardEmitAction = createAction<TapCardEmitAction>(CardsTypes.TAP_CARD_EMIT)
