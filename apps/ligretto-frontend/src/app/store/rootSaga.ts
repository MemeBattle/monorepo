import { all, fork, takeLatest } from 'redux-saga/effects'

import { socketSaga } from '#entities/socket'
import { authRootSaga, getMeSuccess } from '#ducks/auth'

export default function* rootSaga() {
  yield all([fork(authRootSaga), fork(blockedSocketSaga)])
}

function* blockedSocketSaga() {
  yield takeLatest(getMeSuccess, socketSaga)
}
