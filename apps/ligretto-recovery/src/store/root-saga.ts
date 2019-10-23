import { all } from 'redux-saga/effects'
// import { socketSaga } from 'middlewares/saga'

export default function* rootSaga() {
  yield all([
    // fork(socketSaga)
  ])
}
