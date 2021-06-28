import { all, fork } from 'redux-saga/effects'
import { socketSaga } from 'middlewares/saga'
import { roomsRootSaga } from 'ducks/rooms'
import { gameRootSaga } from 'ducks/game'
import { authRootSaga } from 'ducks/auth'

export default function* rootSaga() {
  yield all([fork(socketSaga), fork(roomsRootSaga), fork(gameRootSaga), fork(authRootSaga)])
}
