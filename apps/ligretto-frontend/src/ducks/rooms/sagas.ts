import { takeLatest, take, put, select } from 'redux-saga/effects'
import type { updateRooms as updateRoomsFromServer } from '@memebattle/ligretto-shared'
import {
  createRoomEmitAction,
  searchRoomsEmitAction,
  connectToRoomEmitAction,
  searchRoomsFinishAction,
  createRoomSuccessAction,
  createRoomErrorAction,
  updateRooms,
  connectToRoomErrorAction,
  removeRoomAction as removeRoomFromServerAction,
} from '@memebattle/ligretto-shared'
import { replace, push } from 'connected-react-router'
import { generatePath } from 'react-router-dom'

import { routes } from 'utils/constants'

import {
  connectToRoomAction,
  createRoomAction,
  searchRoomsAction,
  updateRoomsAction,
  setRoomsAction,
  setErrorRoomsAction,
  removeRoomAction,
} from './slice'
import { searchSelector } from './selectors'

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
function* searchRoomsSaga(action: ReturnType<typeof searchRoomsAction>) {
  yield put(searchRoomsEmitAction({ search: action.payload.search }))
  while (true) {
    const finishAction: ReturnType<typeof searchRoomsFinishAction> = yield take(searchRoomsFinishAction.type)
    if (finishAction.payload.search === action.payload.search) {
      yield put(setRoomsAction(finishAction.payload))
      return
    }
  }
}

function* createRoomSaga(action: ReturnType<typeof createRoomAction>) {
  yield put(createRoomEmitAction({ ...action.payload }))
}

function* connectToRoomSaga(action: ReturnType<typeof connectToRoomAction>) {
  yield put(connectToRoomEmitAction(action.payload))
}

function* updateRoomsFromServerSaga(action: ReturnType<typeof updateRoomsFromServer>) {
  const search: ReturnType<typeof searchSelector> = yield select(searchSelector)
  const rooms = action.payload.rooms.filter(({ name }) => name.includes(search))
  yield put(updateRoomsAction({ rooms }))
}

function* removeRoomFromServerSaga(action: ReturnType<typeof removeRoomFromServerAction>) {
  const uuid = action.payload.uuid
  yield put(removeRoomAction({ uuid }))
}

function* connectToRoomError() {
  yield put(replace(routes.ROOMS))
}

function* createRoomSuccessSaga(action: ReturnType<typeof createRoomSuccessAction>) {
  yield put(setErrorRoomsAction({ error: null }))
  yield put(push(generatePath(routes.GAME, { roomUuid: action.payload.game.id })))
}

function* createRoomErrorSaga(action: ReturnType<typeof createRoomErrorAction>) {
  yield put(setErrorRoomsAction({ error: action.payload }))
}

export function* roomsRootSaga() {
  yield takeLatest(searchRoomsAction, searchRoomsSaga)
  yield takeLatest(createRoomAction, createRoomSaga)
  yield takeLatest(connectToRoomAction, connectToRoomSaga)
  yield takeLatest(updateRooms, updateRoomsFromServerSaga)
  yield takeLatest(removeRoomFromServerAction, removeRoomFromServerSaga)
  yield takeLatest(connectToRoomErrorAction, connectToRoomError)
  yield takeLatest(createRoomSuccessAction, createRoomSuccessSaga)
  yield takeLatest(createRoomErrorAction, createRoomErrorSaga)
}
