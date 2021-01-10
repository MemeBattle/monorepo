import { createAction } from '@memebattle/redux-utils'
import type { PushCardAction, TapCardAction } from './types'
import { CardsTypes } from './types'

export const pushCardsAction = createAction<PushCardAction>(CardsTypes.PUSH_CARDS)
export const tapCardAction = createAction<TapCardAction>(CardsTypes.TAP_CARD)
