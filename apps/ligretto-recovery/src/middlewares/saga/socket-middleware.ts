import { eventChannel, END, SagaIterator, EventChannel, Unsubscribe } from 'redux-saga'
import { all, race, actionChannel, take, put, call } from 'redux-saga/effects'
import io from 'socket.io-client'
import { Action, AnyAction } from 'types/actions'
import { WEBSOCKET_URL } from '../../config'
import { createAction } from '../../utils/create-action'

export enum WebsocketActionNames {
  Cancel = '@@websockets/WEBSOCKET_CLOSED',
}

type CancelAction = Action<WebsocketActionNames.Cancel>

const cancel = createAction<CancelAction>(WebsocketActionNames.Cancel)

function socketChannel(socket: SocketIOClient.Socket): EventChannel<any> {
  return eventChannel<any>(
    (emitter): Unsubscribe => {
      socket.on('event', (data: any) => {
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
      const action: AnyAction = yield take(channel)
      console.log('action:', action)
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

    socket.emit('message', socketAction.payload)
  }
}

export function* socketSaga() {
  const socket = io(WEBSOCKET_URL)
  // @ts-ignore
  window.emitEcho = data => {
    socket.emit('message', data)
  }

  yield all([call(socketSendSaga, socket), call(socketReceiveSaga, socket)])
}
