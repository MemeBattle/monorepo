import { all, fork, take } from 'redux-saga/effects'
import { socketSaga } from 'middlewares/saga'
import { roomsRootSaga } from 'ducks/rooms'
import { gameRootSaga } from 'ducks/game'
import { authRootSaga, getMeSuccess } from 'ducks/auth'

export default function* rootSaga() {
  yield all([fork(roomsRootSaga), fork(gameRootSaga), fork(authRootSaga), fork(blockedSocketSaga)])
}

function* blockedSocketSaga() {
  yield take(getMeSuccess)
  yield fork(socketSaga)
}
