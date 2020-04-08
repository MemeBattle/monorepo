import { createAction } from '@memebattle/redux-utils'
import { GameTypes, UpdateGameAction } from './types'

export const updateGameAction = createAction<UpdateGameAction>(GameTypes.UPDATE_GAME)