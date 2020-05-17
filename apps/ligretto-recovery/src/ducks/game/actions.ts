import { createAction } from '@memebattle/redux-utils'
import { GameTypes, SetPlayerColor, TogglePlayerStatusAction, UpdateGameAction } from './types'

export const updateGameAction = createAction<UpdateGameAction>(GameTypes.UPDATE_GAME)
export const togglePlayerStatusAction = createAction<TogglePlayerStatusAction>(GameTypes.TOGGLE_PLAYER_STATUS)
export const setPlayerColorAction = createAction<SetPlayerColor>(GameTypes.SET_PLAYER_COLOR)
