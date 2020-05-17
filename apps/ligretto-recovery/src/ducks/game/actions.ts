import { createAction } from '@memebattle/redux-utils'
import { GameTypes, TogglePlayerStatusAction, UpdateGameAction } from './types'

export const updateGameAction = createAction<UpdateGameAction>(GameTypes.UPDATE_GAME)
export const togglePlayerStatusAction = createAction<TogglePlayerStatusAction>(GameTypes.TOGGLE_PLAYER_STATUS)
