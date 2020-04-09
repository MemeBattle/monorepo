import { takeLatest, put } from 'redux-saga/effects'
import { UpdateGameAction, GameTypes } from '@memebattle/ligretto-shared'
import { updateGameAction } from './actions'

function* gameUpdateSaga(action: UpdateGameAction) {
  const { status, config, id, name } = action.payload
  yield put(updateGameAction({ status, config, id, name }))
}

export function* gameRootSaga() {
  yield takeLatest(GameTypes.UPDATE_GAME, gameUpdateSaga)
}
