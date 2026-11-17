import type { Dispatch, TypedStartListening } from '@reduxjs/toolkit'
import { isAction } from '@reduxjs/toolkit'
import { connectToRoomEmitAction, connectToRoomErrorAction, kickedFromRoomAction, leaveFromRoomEmitAction } from '@memebattle/ligretto-shared'
import type { All } from '#types/store'
import { LIGRETTO_GAMEPLAY_URL } from '#shared/constants/config'
import { socketConnectedAction } from './actions'
import { createGameplaySocket } from './gameplay-socket'

const LOBBY_PATH = '/lobby'

export function addListeners(startListener: TypedStartListening<All>, dispatch: Dispatch, getAccessToken: () => string) {
  const socket = createGameplaySocket({
    baseUrl: LIGRETTO_GAMEPLAY_URL,
    getAccessToken,
    onOpen: () => dispatch(socketConnectedAction()),
    onMessage: data => {
      if (!isAction(data)) {
        console.error('Received invalid action from socket', data)
        return
      }
      // A kick is followed by the room error, but a socket lost in between would otherwise retry its way back in.
      if (connectToRoomErrorAction.match(data) || kickedFromRoomAction.match(data)) {
        socket.stop()
      }
      dispatch(data)
    },
  })

  // Rooms are endpoints: being in a room is having a socket to it, so these two actions move the socket.
  const stopReduxListener = startListener({
    predicate: action => action.type.includes('WEBSOCKET'),
    effect: action => {
      if (connectToRoomEmitAction.match(action)) {
        socket.connect(`/games/${encodeURIComponent(action.payload.roomUuid)}`)
        return
      }
      socket.send(action)
      if (leaveFromRoomEmitAction.match(action)) {
        socket.connect(LOBBY_PATH)
      }
    },
  })

  window.addEventListener('online', socket.resume)
  socket.connect(LOBBY_PATH)

  return () => {
    window.removeEventListener('online', socket.resume)
    stopReduxListener()
    socket.stop()
  }
}
