import { createAction } from '@memebattle/redux-utils'
import type { SetGameLoadedAction, SetPlayerColor, StartGameAction, TogglePlayerStatusAction, UpdateGameAction, SetGameResultAction } from './types'
import { GameTypes } from './types'

export const updateGameAction = createAction<UpdateGameAction>(GameTypes.UPDATE_GAME)
export const togglePlayerStatusAction = createAction<TogglePlayerStatusAction>(GameTypes.TOGGLE_PLAYER_STATUS)
export const setPlayerIdAction = createAction<SetPlayerColor>(GameTypes.SET_PLAYER_ID)
export const startGameAction = createAction<StartGameAction>(GameTypes.START_GAME)
export const setGameLoadedAction = createAction<SetGameLoadedAction>(GameTypes.SET_GAME_LOADED)
export const setGameResultAction = createAction<SetGameResultAction>(GameTypes.SET_GAME_RESULT)
