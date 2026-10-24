import type { Dispatch, TypedStartListening } from '@reduxjs/toolkit'
import { isAction } from '@reduxjs/toolkit'
import type { All } from '#types/store'
import type { Socket } from 'socket.io-client'
import { io } from 'socket.io-client'
import { LIGRETTO_GAMEPLAY_URL } from '#shared/constants/config'
import { getMeSuccess } from '#ducks/auth/authActions'
import { socketConnectedAction } from './actions'

export function addListeners(startListener: TypedStartListening<All>, dispatch: Dispatch, getAccessToken: () => string) {
  let socket: Socket
  let handshakeToken: string | undefined
  try {
    socket = io(LIGRETTO_GAMEPLAY_URL, {
      auth: cb => {
        handshakeToken = getAccessToken()
        cb({ token: handshakeToken })
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

  // Retry if the token changed during the refused handshake; transport errors retry automatically.
  const connectErrorHandler = () => {
    if (!socket.active && getAccessToken() !== handshakeToken) {
      socket.connect()
    }
  }

  socket.on('event', eventHandler)
  socket.on('connect', connectHandler)
  socket.on('connect_error', connectErrorHandler)

  const stopReduxListener = startListener({
    predicate: action => action.type.includes('WEBSOCKET'),
    effect: action => {
      socket.emit('message', action)
    },
  })

  // Socket.IO does not automatically retry a handshake refused by server middleware.
  const stopReconnectListener = startListener({
    actionCreator: getMeSuccess,
    effect: () => {
      if (!socket.connected && !socket.active) {
        socket.connect()
      }
    },
  })

  return () => {
    socket.off('event', eventHandler)
    socket.off('connect', connectHandler)
    socket.off('connect_error', connectErrorHandler)
    stopReduxListener()
    stopReconnectListener()
    socket.disconnect()
  }
}
