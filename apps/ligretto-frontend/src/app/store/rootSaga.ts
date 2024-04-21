import { all, fork, takeLatest } from 'redux-saga/effects'

import { socketSaga } from '#entities/socket'
import { gameRootSaga } from '#ducks/game'
import { usersRootSaga } from '#ducks/users'
import { authRootSaga, getMeSuccess } from '#ducks/auth'
import { analyticsRootSaga } from '#ducks/analytics/sagas'

export default function* rootSaga() {
  yield all([fork(analyticsRootSaga), fork(gameRootSaga), fork(authRootSaga), fork(usersRootSaga), fork(blockedSocketSaga)])
}

function* blockedSocketSaga() {
  yield takeLatest(getMeSuccess, socketSaga)
}
