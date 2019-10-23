import { createAction } from 'utils/create-action'
import { PushCardAction, CardsTypes, TapCardAction } from './types'

export const pushCardAction = createAction<PushCardAction>(CardsTypes.PUSH_CARD)
export const tapCardAction = createAction<TapCardAction>(CardsTypes.TAP_CARD)
