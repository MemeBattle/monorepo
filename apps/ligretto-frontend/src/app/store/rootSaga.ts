import { all, fork, takeLatest } from 'redux-saga/effects'

import { socketSaga } from '#entities/socket'
import { getMeSuccess } from '#ducks/auth'

export default function* rootSaga() {
  yield all([fork(blockedSocketSaga)])
}

function* blockedSocketSaga() {
  yield takeLatest(getMeSuccess, socketSaga)
}
