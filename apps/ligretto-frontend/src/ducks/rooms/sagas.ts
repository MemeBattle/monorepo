import { takeLatest, put } from 'redux-saga/effects'
import type { updateRooms as updateRoomsFromServer } from '@memebattle/ligretto-shared'
import {
  createRoomEmitAction,
  getRoomsEmitAction,
  connectToRoomEmitAction,
  createRoomSuccessAction,
  createRoomErrorAction,
  updateRooms,
  connectToRoomErrorAction,
  removeRoomAction as removeRoomFromServerAction,
} from '@memebattle/ligretto-shared'
import { replace, push } from 'redux-first-history'
import { generatePath } from 'react-router-dom'

import { routes } from '#shared/constants'

import { connectToRoomAction, createRoomAction, getRoomsAction, updateRoomsAction, setErrorRoomsAction, removeRoomAction } from './slice'

function* getRoomsSaga() {
  yield put(getRoomsEmitAction())
}

function* createRoomSaga(action: ReturnType<typeof createRoomAction>) {
  yield put(createRoomEmitAction({ ...action.payload }))
}

function* connectToRoomSaga(action: ReturnType<typeof connectToRoomAction>) {
  yield put(connectToRoomEmitAction(action.payload))
}

function* updateRoomsFromServerSaga(action: ReturnType<typeof updateRoomsFromServer>) {
  const rooms = action.payload.rooms
  yield put(updateRoomsAction({ rooms }))
}

function* removeRoomFromServerSaga(action: ReturnType<typeof removeRoomFromServerAction>) {
  const uuid = action.payload.uuid
  yield put(removeRoomAction({ uuid }))
}

function* connectToRoomError() {
  yield put(replace(routes.HOME))
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
