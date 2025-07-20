import { type TypedStartListening } from '@reduxjs/toolkit'
import { replace, push } from 'redux-first-history'
import { generatePath } from 'react-router-dom'

import {
  getRoomsEmitAction,
  createRoomEmitAction,
  updateRoomsAction as updateRoomsServerAction,
  removeRoomAction as removeRoomServerAction,
  connectToRoomErrorAction,
  connectToRoomEmitAction,
  createRoomErrorAction,
  createRoomSuccessAction,
} from '@memebattle/ligretto-shared'

import { routes } from '#shared/constants'
import type { RoomsState } from './slice'
import { getRoomsAction, createRoomAction } from './slice'
import { connectToRoomAction, updateRoomsAction, setErrorRoomsAction, removeRoomAction } from './slice'

export function addListeners(startListener: TypedStartListening<{ rooms: RoomsState }>) {
  startListener({
    actionCreator: getRoomsAction,
    effect: (_action, listenerApi) => {
      listenerApi.dispatch(getRoomsEmitAction())
    },
  })

  startListener({
    actionCreator: createRoomAction,
    effect: (action, listenerApi) => {
      listenerApi.dispatch(createRoomEmitAction(action.payload))
    },
  })

  startListener({
    actionCreator: connectToRoomAction,
    effect: (action, listenerApi) => {
      listenerApi.dispatch(connectToRoomEmitAction(action.payload))
    },
  })

  startListener({
    actionCreator: updateRoomsServerAction,
    effect: (action, listenerApi) => {
      const rooms = action.payload.rooms
      listenerApi.dispatch(updateRoomsAction({ rooms }))
    },
  })

  startListener({
    actionCreator: removeRoomServerAction,
    effect: (action, listenerApi) => {
      const uuid = action.payload.uuid
      listenerApi.dispatch(removeRoomAction({ uuid }))
    },
  })

  startListener({
    actionCreator: connectToRoomErrorAction,
    effect: (_action, listenerApi) => {
      listenerApi.dispatch(replace(routes.HOME))
    },
  })

  startListener({
    actionCreator: createRoomSuccessAction,
    effect: (action, listenerApi) => {
      listenerApi.dispatch(setErrorRoomsAction({ error: null }))
      listenerApi.dispatch(push(generatePath(routes.GAME, { roomUuid: action.payload.game.id })))
    },
  })

  startListener({
    actionCreator: createRoomErrorAction,
    effect: (action, listenerApi) => {
      listenerApi.dispatch(setErrorRoomsAction({ error: action.payload }))
    },
  })
}
