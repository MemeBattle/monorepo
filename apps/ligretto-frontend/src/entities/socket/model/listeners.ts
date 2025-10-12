import type { Dispatch, TypedStartListening } from '@reduxjs/toolkit'
import { isAction } from '@reduxjs/toolkit'
import type { All } from '#types/store'
import type { Socket } from 'socket.io-client'
import { io } from 'socket.io-client'
import { LIGRETTO_GAMEPLAY_URL } from '#shared/constants/config'
import { LOCAL_STORAGE_TOKEN_KEY } from '#ducks/auth/constants'
import { socketConnectedAction } from './actions'

export function addListeners(startListener: TypedStartListening<All>, dispatch: Dispatch) {
  let socket: Socket
  try {
    socket = io(LIGRETTO_GAMEPLAY_URL, {
      auth: {
        token: window.localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY),
      },
    })
  } catch (e) {
    console.error(e)
    return
  }

  socket.on('event', (data: unknown) => {
    if (isAction(data)) {
      dispatch(data)
    } else {
      console.error('Received invalid action from socket', data)
    }
  })

  startListener({
    predicate: action => action.type.includes('WEBSOCKET'),
    effect: action => {
      socket.emit('message', action)
    },
  })

  dispatch(socketConnectedAction())
}
