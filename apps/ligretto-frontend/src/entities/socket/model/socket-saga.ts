import * as Sentry from '@sentry/browser'
import type { SagaIterator, EventChannel, Unsubscribe } from 'redux-saga'
import type { NotUndefined } from '@redux-saga/types'
import { eventChannel, END } from 'redux-saga'
import { all, actionChannel, take, put, call } from 'redux-saga/effects'
import io from 'socket.io-client'
import type { Socket } from 'socket.io-client'

import { extractSentryTracingHeaders } from '@memebattle/ligretto-shared'

import { LOCAL_STORAGE_TOKEN_KEY } from '#ducks/auth/constants'

import { LIGRETTO_GAMEPLAY_URL } from '#shared/constants/config'
import { socketConnectedAction } from './actions'
import { getSentryTracingHeaders } from './getSentryTracingHeaders'

function socketChannel(socket: Socket): EventChannel<NotUndefined> {
  return eventChannel<NotUndefined>((emitter): Unsubscribe => {
    socket.on('event', (data: unknown, metadata: unknown) => {
      if (data) {
        const sentryTracingHeaders = extractSentryTracingHeaders(metadata)
        if (sentryTracingHeaders) {
          Sentry.continueTrace(sentryTracingHeaders, transactionContext => {
            Sentry.startSpan({ ...transactionContext, name: 'Receive event', op: 'websocket.event' }, () => {
              emitter(data)
            })
          })
        } else {
          emitter(data)
        }
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

    Sentry.startSpan({ name: 'Emit message', op: 'websocket.message', scope }, span => {
      socket.emit('message', socketAction, span && getSentryTracingHeaders(span))
    })
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
