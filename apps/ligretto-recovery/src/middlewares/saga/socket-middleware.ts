import type { SagaIterator, EventChannel, Unsubscribe } from 'redux-saga'
import { eventChannel, END } from 'redux-saga'
import { all, race, actionChannel, take, put, call } from 'redux-saga/effects'
import io from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { WEBSOCKET_URL } from '../../config'
import { createAction } from '@reduxjs/toolkit'
import { LOCAL_STORAGE_TOKEN_KEY } from '../../ducks/auth/constants'

export enum WebsocketActionNames {
  Cancel = '@@websockets/WEBSOCKET_CLOSED',
}

const cancel = createAction(WebsocketActionNames.Cancel)

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

  try {
    while (true) {
      const action = yield take(channel)
      yield put(action)
    }
  } finally {
    console.warn('Websocket: Socket closed')
    yield put(cancel())
  }
}

function* socketSendSaga(socket: Socket): SagaIterator {
  const channel = yield actionChannel(({ type }: { type: string }) => type.includes('WEBSOCKET'))

  while (true) {
    const { socketAction, cancelAction } = yield race({
      socketAction: take(channel),
      cancel: take(WebsocketActionNames.Cancel),
    })

    if (cancelAction) {
      console.warn('Websocket: Cannot send message')
    }

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
