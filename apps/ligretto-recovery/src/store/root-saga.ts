import { all, fork } from 'redux-saga/effects'
import { socketSaga } from 'middlewares/saga'
import { cardsRootSaga } from 'ducks/cards'
import { roomsRootSaga } from 'ducks/rooms'
import { gameRootSaga } from 'ducks/game'

export default function* rootSaga() {
  yield all([fork(socketSaga), fork(cardsRootSaga), fork(roomsRootSaga), fork(gameRootSaga)])
}
