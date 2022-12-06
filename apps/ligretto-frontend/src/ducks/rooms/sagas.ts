import { takeLatest, take, put, select } from 'redux-saga/effects'
import type { updateRooms as updateRoomsFromServer } from '@memebattle/ligretto-shared'
import {
  createRoomEmitAction,
  getRoomsEmitAction,
  connectToRoomEmitAction,
  getRoomsFinishAction,
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
  getRoomsAction,
  updateRoomsAction,
  setRoomsAction,
  setErrorRoomsAction,
  removeRoomAction,
} from './slice'
import { searchSelector } from './selectors'

function* getRoomsSaga() {
  yield put(getRoomsEmitAction())
  const finishAction: ReturnType<typeof getRoomsFinishAction> = yield take(getRoomsFinishAction.type)
  yield put(setRoomsAction(finishAction.payload))
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
  yield takeLatest(getRoomsAction, getRoomsSaga)
  yield takeLatest(createRoomAction, createRoomSaga)
  yield takeLatest(connectToRoomAction, connectToRoomSaga)
  yield takeLatest(updateRooms, updateRoomsFromServerSaga)
  yield takeLatest(removeRoomFromServerAction, removeRoomFromServerSaga)
  yield takeLatest(connectToRoomErrorAction, connectToRoomError)
  yield takeLatest(createRoomSuccessAction, createRoomSuccessSaga)
  yield takeLatest(createRoomErrorAction, createRoomErrorSaga)
}
