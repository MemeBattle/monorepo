import { takeEvery, put } from 'redux-saga/effects'
import { CardsTypes, TapCardAction } from './types'
import { CardPositions } from '@memebattle/ligretto-shared'
import { tapCardEmitAction } from './actions'

const cardPositionsToEmit = [CardPositions.q, CardPositions.w, CardPositions.e, CardPositions.r, CardPositions.t]

function* emitTapCardSaga(action: TapCardAction) {
  if (cardPositionsToEmit.includes(action.payload.cardPosition)) {
    yield put(tapCardEmitAction(action.payload))
  }
}

export function* cardsRootSaga() {
  yield takeEvery(CardsTypes.TAP_CARD, emitTapCardSaga)
}
