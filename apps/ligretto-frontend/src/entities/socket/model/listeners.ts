import type { Dispatch, TypedStartListening } from '@reduxjs/toolkit'
import { isAction } from '@reduxjs/toolkit'
import type { All } from '#types/store'
import type { Socket } from 'socket.io-client'
import { io } from 'socket.io-client'
import { LIGRETTO_GAMEPLAY_URL } from '#shared/constants/config'
import { socketConnectedAction } from './actions'

export function addListeners(startListener: TypedStartListening<All>, dispatch: Dispatch, token: string) {
  let socket: Socket
  try {
    // The token comes from the same getMeSuccess that set auth.userId, so the
    // socket identity cannot diverge from the one the UI renders with —
    // localStorage may already hold a token from a concurrent getMe response.
    socket = io(LIGRETTO_GAMEPLAY_URL, {
      auth: {
        token,
      },
    })
  } catch (e) {
    console.error(e)
    return
  }

  const eventHandler = (data: unknown) => {
    if (isAction(data)) {
      dispatch(data)
    } else {
      console.error('Received invalid action from socket', data)
    }
  }
  const connectHandler = () => dispatch(socketConnectedAction())

  socket.on('event', eventHandler)
  socket.on('connect', connectHandler)

  const stopReduxListener = startListener({
    predicate: action => action.type.includes('WEBSOCKET'),
    effect: action => {
      socket.emit('message', action)
    },
  })

  return () => {
    socket.off('event', eventHandler)
    socket.off('connect', connectHandler)
    stopReduxListener()
    socket.disconnect()
  }
}
