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
  // The token the last handshake presented, to tell a refusal of an outdated token from one of the current token.
  let handshakeToken: string | undefined
  try {
    // A getter, not a value: the store is the one source of the token, and socket.io calls this on every connection
    // attempt, so a reconnect after a refresh presents the token the store holds now. The handshake is the only place
    // the gameplay backend verifies it. The store's userId never changes under a live socket (a `me` naming another
    // user restarts the page instead), so the socket's identity and the UI's cannot diverge.
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

  // A refresh can land while a handshake with the old token is in flight. `getMeSuccess` then sees the socket still
  // active and does nothing, and the refusal that follows leaves it down until the next refresh. So a server refusal of
  // a token older than the store's is retried once with the fresh one. A server refusal turns `active` false, while a
  // transport error keeps it true and the manager retries on its own. A refusal of the current token is not retried, or
  // a rejected token would loop.
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

  // The gameplay backend refuses a handshake with an expired token, and socket.io does not retry a refusal by the
  // server's middleware on its own (`active` turns false), so the next fresh token is what brings the socket back. This
  // covers a refusal that arrives before the refresh; `connectErrorHandler` covers one that arrives after it.
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
