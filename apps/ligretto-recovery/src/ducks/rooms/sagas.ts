import { takeLatest, take, put } from 'redux-saga/effects'
import { ConnectToRoomAction, CreateRoomAction, RoomsTypes, SearchRoomsAction, SearchRoomsFinishAction } from './types'
import { connectToRoomEmitAction, updateRoomsAction } from './actions'
import { createRoomEmitAction, searchRoomsEmitAction } from '@memebattle/ligretto-shared'

/**
 * Сага могла стрельнуть "запрос" на поиск комнат, но ответ еще не успел придти.
 * В этот момент появляется новая сага поиска, старая исчезает
 * стреляется новый "запрос" на поиск
 * приходит ответ на старый поиск.
 *
 * Для этого кейса добавляем 'search' в ответный экшен с бэка,
 * если текущий поиск не совпадает с тем, что вернулся, ждем нужный.
 *
 * @param action
 */
function* searchRoomsSaga(action: SearchRoomsAction) {
  const a = searchRoomsEmitAction({ search: action.payload.search })
  yield put(a)
  while (true) {
    const finishAction: SearchRoomsFinishAction = yield take(RoomsTypes.SEARCH_ROOMS_FINISH)
    if (finishAction.payload.search === action.payload.search) {
      yield put(updateRoomsAction(finishAction.payload))
      return
    }
  }
}

function* createRoomSaga(action: CreateRoomAction) {
  yield put(createRoomEmitAction({ ...action.payload }))
}

function* connectToRoomSaga(action: ConnectToRoomAction) {
  yield put(connectToRoomEmitAction(action.payload))
}

export function* roomsRootSaga() {
  yield takeLatest(RoomsTypes.SEARCH_ROOMS, searchRoomsSaga)
  yield takeLatest(RoomsTypes.CREATE_ROOM, createRoomSaga)
  yield takeLatest(RoomsTypes.CONNECT_TO_ROOM, connectToRoomSaga)
}
