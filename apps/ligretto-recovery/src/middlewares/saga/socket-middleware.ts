import type { SagaIterator, EventChannel, Unsubscribe } from 'redux-saga'
import { eventChannel, END } from 'redux-saga'
import { all, race, actionChannel, take, put, call } from 'redux-saga/effects'
import io from 'socket.io-client'
import type { Action } from '@memebattle/redux-utils'
import { createAction } from '@memebattle/redux-utils'
import { WEBSOCKET_URL } from '../../config'

export enum WebsocketActionNames {
  Cancel = '@@websockets/WEBSOCKET_CLOSED',
}

type CancelAction = Action<WebsocketActionNames.Cancel>

const cancel = createAction<CancelAction>(WebsocketActionNames.Cancel)

function socketChannel(socket: SocketIOClient.Socket): EventChannel<unknown> {
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

function* socketReceiveSaga(socket: SocketIOClient.Socket): SagaIterator {
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

function* socketSendSaga(socket: SocketIOClient.Socket): SagaIterator {
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
    query: {
      token:
        'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI1ZjU3YmMxYWVmYmFhYzAwM2Q5M2E0NDIiLCJwZXJtaXNzaW9ucyI6eyJDQVMiOlsiZnVsbCJdfSwiaWF0IjoxNjEwMDM0ODc0LCJleHAiOjE2MTAyMDc2NzR9.1vHanbu_PIHvobnCHEmDRIkOrQoFlZ9dbWpqrRBHD5mbmVZBsDJCVUAjMEw7_5TwQiIx9jdilL6VOuK1WyE-SrWxvXrjT3O5pGVdEz-Iaf3UHuesp-LreTonIiLPDjdwVtZeIBvgNXtAgxUN68mAEGmPd9Yze-oBtMS8qOxCpvLvIetdMFuzkjNiWlLCLJFVfmx68NxAx8Ns8u1t27HFAFK3oSDuJgYDQB4IhoeXacW0aQQet_bjcrntfD0x1xgvjZIYyiAclCqgDiq7rxVyLNhM2FHhqawFsgQHbwLEwOZ1jpgslhufPvcTWok1qhdriYLf356vqzzsx00tNhYAfheDqVVJHlI6A927Wc6RkOIMsJXAu2-V_2usX7cUtlKr8RWepPBA_Fb0Sb9HFqpEee2WMX8lQd_UO_hV0rNovcsfyp2oZ_3yB6NyvKQHpc-w5OBMj6-TY5RghJ9zF5rzzKTMt4aAahtqT-RhTrHsUjOHX-XjRPrjc2knJEEviHhiCa4SeoSstxS-Gt5K314-pJTyT_BDUL3J8h_VnzAHmIppyZdY_bha7EDesh3WH02pceZmhgcZ8x88tp-VSN0ifjF3W2RbcAsU01S-dFKdRCVNn2CsOlGHjNaEjtWOSigC1ruj6KGGNAdAz85_pBOq1S_OkNcZlytHk1V8IiHzfag',
    },
  })

  yield all([call(socketSendSaga, socket), call(socketReceiveSaga, socket)])
}
