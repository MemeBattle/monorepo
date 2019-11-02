import { all, fork } from 'redux-saga/effects'
import { socketSaga } from 'middlewares/saga'
import { cardsRootSaga } from 'ducks/cards'

export default function* rootSaga() {
  yield all([fork(socketSaga), fork(cardsRootSaga)])
}
