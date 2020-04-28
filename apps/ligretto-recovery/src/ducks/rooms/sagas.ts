import { takeLatest, take, put, select } from 'redux-saga/effects'
import { ConnectToRoomAction, CreateRoomAction, RoomsTypes, SearchRoomsAction } from './types'
import { connectToRoomAction, searchRoomsAction, updateRoomsAction, setRoomsAction } from './actions'
import {
  createRoomEmitAction,
  searchRoomsEmitAction,
  connectToRoomEmitAction,
  SearchRoomsFinishAction,
  RoomsTypes as RoomsTypesShared,
  UpdateRooms as UpdateRoomsFromServer,
} from '@memebattle/ligretto-shared'
import { LocationChangeAction, LOCATION_CHANGE, replace } from 'connected-react-router'
import { matchPath } from 'react-router-dom'
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
    const finishAction: SearchRoomsFinishAction = yield take(RoomsTypesShared.SEARCH_ROOMS_FINISH)
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
  if (match) {
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

function* updateRoomsFromServerSaga(action: UpdateRoomsFromServer) {
  const search: ReturnType<typeof selectSearch> = yield select(selectSearch)
  const rooms = action.payload.rooms.filter(({ name }) => name.includes(search))
  yield put(updateRoomsAction({ rooms }))
}

function* connectToRoomError() {
  yield put(replace(routes.ROOMS))
}

export function* roomsRootSaga() {
  yield takeLatest(RoomsTypes.SEARCH_ROOMS, searchRoomsSaga)
  yield takeLatest(RoomsTypes.CREATE_ROOM, createRoomSaga)
  yield takeLatest(RoomsTypes.CONNECT_TO_ROOM, connectToRoomSaga)
  yield takeLatest(RoomsTypesShared.UPDATE_ROOMS_LIST, updateRoomsFromServerSaga)
  yield takeLatest(RoomsTypesShared.CONNECT_TO_ROOM_ERROR, connectToRoomError)
  yield takeLatest(LOCATION_CHANGE, gameRouteWatcher)
  yield takeLatest(LOCATION_CHANGE, searchRoomsRouteWatcher)
}
