import type { TypedStartListening } from '@reduxjs/toolkit'
import { TaskAbortError } from '@reduxjs/toolkit'
import {
  PlayerStatus,
  resumeGameEmitAction,
  setPlayerStatusEmitAction,
  startGameEmitAction,
  takeFromLigrettoDeckAction,
  takeFromStackDeckAction,
  leaveFromRoomEmitAction,
  connectToRoomSuccessAction,
  endRoundAction,
  updateGameAction,
} from '@memebattle/ligretto-shared'

import {
  setGameLoadedAction,
  setGameResultAction,
  startGameAction,
  togglePlayerStatusAction,
  updateGameAction as updateGameSliceAction,
  tapStackDeckCardAction,
  tapLigrettoDeckCardAction,
  resetGameStateAction,
  resumeGameAction,
} from './slice'
import { gameIdSelector, playerStatusSelector } from './selectors'
import { matchPath } from 'react-router'
import { routes } from '#shared/constants'
import { LOCATION_CHANGE, push } from 'redux-first-history'
import { socketConnectedAction } from '#entities/socket'
import { locationSelector } from '#ducks/router'
import { connectToRoomAction } from '#ducks/rooms'
import type { All } from '#types/store.js'

export function addListeners(startListener: TypedStartListening<All>) {
  startListener({
    predicate: action => action.type === LOCATION_CHANGE || socketConnectedAction.match(action),
    effect: async (action, listenerApi) => {
      listenerApi.cancelActiveListeners()
      const state = listenerApi.getState()
      try {
        const location = locationSelector(state)

        const match = location?.pathname && matchPath(routes.GAME, location.pathname)

        if (match) {
          const roomUuid = match.params.roomUuid

          if (!roomUuid) {
            listenerApi.dispatch(push(routes.HOME))
            return
          }
          listenerApi.dispatch(connectToRoomAction({ roomUuid }))
          await listenerApi.take(action => action.type === LOCATION_CHANGE)
        }
      } catch (e) {
        if (e instanceof TaskAbortError) {
          const newLocation = locationSelector(listenerApi.getState())
          const match = newLocation?.pathname && matchPath(routes.GAME, newLocation.pathname)
          if (!match) {
            listenerApi.dispatch(leaveFromRoomEmitAction())
            listenerApi.dispatch(resetGameStateAction())
          }
        }
      }
    },
  })

  startListener({
    actionCreator: updateGameAction,
    effect: (action, listenerApi) => {
      listenerApi.dispatch(updateGameSliceAction(action.payload))
    },
  })

  startListener({
    actionCreator: endRoundAction,
    effect: ({ payload }, listenerApi) => {
      listenerApi.dispatch(setGameResultAction(payload))
    },
  })

  startListener({
    actionCreator: connectToRoomSuccessAction,
    effect: (action, listenerApi) => {
      listenerApi.dispatch(updateGameSliceAction(action.payload.game))
      listenerApi.dispatch(setGameLoadedAction(true))
    },
  })

  startListener({
    actionCreator: tapLigrettoDeckCardAction,
    effect: (_action, listenerApi) => {
      const gameId = gameIdSelector(listenerApi.getState())

      listenerApi.dispatch(takeFromLigrettoDeckAction({ gameId }))
    },
  })

  startListener({
    actionCreator: tapStackDeckCardAction,
    effect: (_action, listenerApi) => {
      const gameId = gameIdSelector(listenerApi.getState())

      listenerApi.dispatch(takeFromStackDeckAction({ gameId }))
    },
  })

  startListener({
    actionCreator: togglePlayerStatusAction,
    effect: (_action, listenerApi) => {
      const state = listenerApi.getState()

      const currentStatus = playerStatusSelector(state)
      const gameId = gameIdSelector(state)

      const status = currentStatus === PlayerStatus.DontReadyToPlay ? PlayerStatus.ReadyToPlay : PlayerStatus.DontReadyToPlay

      listenerApi.dispatch(setPlayerStatusEmitAction({ status, gameId }))
    },
  })

  startListener({
    actionCreator: startGameAction,
    effect: (_action, listenerApi) => {
      const state = listenerApi.getState()

      const gameId = gameIdSelector(state)

      listenerApi.dispatch(startGameEmitAction({ gameId }))
    },
  })

  startListener({
    actionCreator: resumeGameAction,
    effect: (_action, listenerApi) => {
      const gameId = gameIdSelector(listenerApi.getState())

      listenerApi.dispatch(resumeGameEmitAction({ gameId }))
    },
  })
}
