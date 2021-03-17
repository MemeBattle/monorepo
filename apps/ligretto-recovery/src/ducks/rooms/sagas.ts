import { takeLatest, take, put, select } from 'redux-saga/effects'
import type { ConnectToRoomAction, CreateRoomAction, SearchRoomsAction } from './types'
import { RoomsTypes } from './types'
import { connectToRoomAction, searchRoomsAction, updateRoomsAction, setRoomsAction } from './actions'
import {
  createRoomEmitAction,
  searchRoomsEmitAction,
  connectToRoomEmitAction,
  searchRoomsFinishAction,
  updateRooms as updateRoomsFromServer,
  connectToRoomSuccessAction as connectToRoomSuccessActionShared,
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
function* searchRoomsSaga(action: SearchRoomsAction) {
  yield put(searchRoomsEmitAction({ search: action.payload.search }))
  while (true) {
    const finishAction: ReturnType<typeof searchRoomsFinishAction> = yield take(searchRoomsFinishAction.type)
    if (finishAction.payload.search === action.payload.search) {
      yield put(setRoomsAction(finishAction.payload))
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
    yield put(searchRoomsAction({ search }))
  }
}

function* updateRoomsFromServerSaga(action: ReturnType<typeof updateRoomsFromServer>) {
  const search: ReturnType<typeof selectSearch> = yield select(selectSearch)
  const rooms = action.payload.rooms.filter(({ name }) => name.includes(search))
  yield put(updateRoomsAction({ rooms }))
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
  yield takeLatest(RoomsTypes.SEARCH_ROOMS, searchRoomsSaga)
  yield takeLatest(RoomsTypes.CREATE_ROOM, createRoomSaga)
  yield takeLatest(RoomsTypes.CONNECT_TO_ROOM, connectToRoomSaga)
  yield takeLatest(updateRooms.type, updateRoomsFromServerSaga)
  yield takeLatest(connectToRoomErrorAction.type, connectToRoomError)
  yield takeLatest(LOCATION_CHANGE, gameRouteWatcher)
  yield takeLatest(LOCATION_CHANGE, searchRoomsRouteWatcher)
  yield takeLatest(createRoomSuccessAction.type, createRoomSuccessSaga)
  yield takeLatest(connectToRoomSuccessAction.type, connectToRoomSuccessSaga)
}
