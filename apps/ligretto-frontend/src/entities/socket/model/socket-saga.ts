import type { SagaIterator, EventChannel, Unsubscribe } from 'redux-saga'
import type { NotUndefined } from '@redux-saga/types'
import { eventChannel, END } from 'redux-saga'
import { all, actionChannel, take, put, call } from 'redux-saga/effects'
import io from 'socket.io-client'
import type { Socket } from 'socket.io-client'

import { LOCAL_STORAGE_TOKEN_KEY } from '#ducks/auth/constants'

import { LIGRETTO_GAMEPLAY_URL } from '#shared/constants/config'
import { socketConnectedAction } from './actions'

function socketChannel(socket: Socket): EventChannel<NotUndefined> {
  return eventChannel<NotUndefined>((emitter): Unsubscribe => {
    socket.on('event', (data: unknown) => {
      if (data) {
        emitter(data)
      }
    })

    socket.on('disconnect', () => {
      emitter(END)
    })

    return () => {
      socket.off('event')
      socket.off('disconnect')
    }
  })
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
  let socket
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
  yield all([call(socketSendSaga, socket), call(socketReceiveSaga, socket), put(socketConnectedAction())])
}
