import { all, fork } from 'redux-saga/effects'
import { socketSaga } from 'middlewares/saga'
import { cardsRootSaga } from 'ducks/cards'
import { roomsRootSaga } from 'ducks/rooms'

export default function* rootSaga() {
  yield all([fork(socketSaga), fork(cardsRootSaga), fork(roomsRootSaga)])
}
