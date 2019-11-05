import { takeLatest, take, put } from 'redux-saga/effects'
import { RoomsTypes, SearchRoomsAction, SearchRoomsFinishAction } from './types'
import { searchRoomsEmitAction, updateRoomsAction } from './actions'

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
  yield put(searchRoomsEmitAction(action.payload))
  while (true) {
    const finishAction: SearchRoomsFinishAction = yield take(RoomsTypes.SEARCH_ROOMS_FINISH)
    if (finishAction.payload.search === action.payload.search) {
      yield put(updateRoomsAction(finishAction.payload))
      return
    }
  }
}

export function* roomsRootSaga() {
  yield takeLatest(RoomsTypes.SEARCH_ROOMS, searchRoomsSaga)
}
