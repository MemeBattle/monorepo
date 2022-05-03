import type { SagaIterator, EventChannel, Unsubscribe } from 'redux-saga'
import { eventChannel, END } from 'redux-saga'
import { all, actionChannel, take, put, call } from 'redux-saga/effects'
import io from 'socket.io-client'
import type { Socket } from 'socket.io-client'

import { LOCAL_STORAGE_TOKEN_KEY } from 'ducks/auth/constants'

import { WEBSOCKET_URL } from '../../config'

function socketChannel(socket: Socket): EventChannel<unknown> {
  return eventChannel<unknown>(
    (emitter): Unsubscribe => {
      socket.on('event', (data: unknown) => {
        emitter(data)
      })

      socket.on('disconnect', () => {
        emitter(END)
      })

      return () => {
        socket.off('event')
        socket.off('disconnect')
      }
    },
  )
}

function* socketReceiveSaga(socket: Socket): SagaIterator {
  const channel: EventChannel<string> = yield call(socketChannel, socket)

  while (true) {
    const action = yield take(channel)
    yield put(action)
  }
}

function* socketSendSaga(socket: Socket): SagaIterator {
  const channel = yield actionChannel(({ type }: { type: string }) => type.includes('WEBSOCKET'))

  while (true) {
    const socketAction = yield take(channel)

    socket.emit('message', socketAction)
  }
}

export function* socketSaga() {
  const socket = io(WEBSOCKET_URL, {
    auth: {
      token: window.localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY),
    },
  })

  yield all([call(socketSendSaga, socket), call(socketReceiveSaga, socket)])
}
