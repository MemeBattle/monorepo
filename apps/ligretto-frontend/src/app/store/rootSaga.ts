import { all, fork, takeLatest } from 'redux-saga/effects'

import { socketSaga } from '#entities/socket'
import { usersRootSaga } from '#ducks/users'
import { authRootSaga, getMeSuccess } from '#ducks/auth'

export default function* rootSaga() {
  yield all([fork(authRootSaga), fork(usersRootSaga), fork(blockedSocketSaga)])
}

function* blockedSocketSaga() {
  yield takeLatest(getMeSuccess, socketSaga)
}
