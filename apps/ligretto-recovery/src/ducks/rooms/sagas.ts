import { takeLatest, take, put, select } from 'redux-saga/effects'
import { searchRoomsActions, setRoomsActions, updateRoomsActions } from './slice'
import { connectToRoomAction, createRoomAction } from './slice'
import type {
  updateRooms as updateRoomsFromServer,
  connectToRoomSuccessAction as connectToRoomSuccessActionShared,
} from '@memebattle/ligretto-shared'
import {
  createRoomEmitAction,
  searchRoomsEmitAction,
  connectToRoomEmitAction,
  searchRoomsFinishAction,
  createRoomSuccessAction,
  updateRooms,
  connectToRoomErrorAction,
  connectToRoomSuccessAction,
} from '@memebattle/ligretto-shared'
import type { LocationChangeAction } from 'connected-react-router'
import { LOCATION_CHANGE, replace, push } from 'connected-react-router'
import { matchPath, generatePath } from 'react-router-dom'
import { routes } from '../../utils/constants'
import { selectSearch } from './selectors'

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
function* searchRoomsSaga(action: typeof searchRoomsActions) {
  yield put(searchRoomsEmitAction({ search: action.payload.search }))
  while (true) {
    const finishAction: ReturnType<typeof searchRoomsFinishAction> = yield take(searchRoomsFinishAction.type)
    if (finishAction.payload.search === action.payload.search) {
      yield put(setRoomsActions(finishAction.payload))
      return
    }
  }
}

function* createRoomSaga(action: typeof createRoomAction) {
  yield put(createRoomEmitAction({ ...action.payload }))
}

function* connectToRoomSaga(action: typeof connectToRoomAction) {
  yield put(connectToRoomEmitAction(action.payload))
}

function* gameRouteWatcher(action: LocationChangeAction) {
  const match = matchPath<{ roomUuid: string }>(action.payload.location.pathname, routes.GAME)
  if (match && action.payload.isFirstRendering) {
    yield put(connectToRoomAction({ roomUuid: match.params.roomUuid }))
  }
}

function* searchRoomsRouteWatcher(action: LocationChangeAction) {
  const match = matchPath(action.payload.location.pathname, routes.ROOMS)
  if (match) {
    const search: ReturnType<typeof selectSearch> = yield select(selectSearch)
    yield put(searchRoomsActions({ search }))
  }
}

function* updateRoomsFromServerSaga(action: ReturnType<typeof updateRoomsFromServer>) {
  const search: ReturnType<typeof selectSearch> = yield select(selectSearch)
  const rooms = action.payload.rooms.filter(({ name }) => name.includes(search))
  yield put(updateRoomsActions({ rooms }))
}

function* connectToRoomError() {
  yield put(replace(routes.ROOMS))
}

function* createRoomSuccessSaga(action: ReturnType<typeof createRoomSuccessAction>) {
  yield put(push(generatePath(routes.GAME, { roomUuid: action.payload.game.id })))
}

function* connectToRoomSuccessSaga(action: ReturnType<typeof connectToRoomSuccessActionShared>) {
  yield put(push(generatePath(routes.GAME, { roomUuid: action.payload.game.id })))
}

export function* roomsRootSaga() {
  yield takeLatest(searchRoomsActions.type, searchRoomsSaga)
  yield takeLatest(createRoomAction.type, createRoomSaga)
  yield takeLatest(connectToRoomAction.type, connectToRoomSaga)
  yield takeLatest(updateRooms.type, updateRoomsFromServerSaga)
  yield takeLatest(connectToRoomErrorAction.type, connectToRoomError)
  yield takeLatest(LOCATION_CHANGE, gameRouteWatcher)
  yield takeLatest(LOCATION_CHANGE, searchRoomsRouteWatcher)
  yield takeLatest(createRoomSuccessAction.type, createRoomSuccessSaga)
  yield takeLatest(connectToRoomSuccessAction.type, connectToRoomSuccessSaga)
}
