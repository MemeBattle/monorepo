import { all, fork, takeLatest } from 'redux-saga/effects'

import { socketSaga } from 'middlewares/saga'
import { roomsRootSaga } from 'ducks/rooms'
import { gameRootSaga } from 'ducks/game'
import { usersRootSaga } from 'ducks/users'
import { authRootSaga, getMeSuccess } from 'ducks/auth'

export default function* rootSaga() {
  yield all([fork(roomsRootSaga), fork(gameRootSaga), fork(authRootSaga), fork(usersRootSaga), fork(blockedSocketSaga)])
}

function* blockedSocketSaga() {
  yield takeLatest(getMeSuccess, socketSaga)
}
