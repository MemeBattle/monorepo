import { createAction } from '@memebattle/redux-utils'
import { GameTypes, SetGameLoadedAction, SetPlayerColor, StartGameAction, TogglePlayerStatusAction, UpdateGameAction } from './types'

export const updateGameAction = createAction<UpdateGameAction>(GameTypes.UPDATE_GAME)
export const togglePlayerStatusAction = createAction<TogglePlayerStatusAction>(GameTypes.TOGGLE_PLAYER_STATUS)
export const setPlayerColorAction = createAction<SetPlayerColor>(GameTypes.SET_PLAYER_COLOR)
export const startGameAction = createAction<StartGameAction>(GameTypes.START_GAME)
export const setGameLoadedAction = createAction<SetGameLoadedAction>(GameTypes.SET_GAME_LOADED)
