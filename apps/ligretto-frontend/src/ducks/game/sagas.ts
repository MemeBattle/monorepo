import { put, select, takeEvery, takeLatest } from 'redux-saga/effects'
import {
  PlayerStatus,
  putCardAction,
  putCardFromStackOpenDeck,
  setPlayerStatusEmitAction,
  startGameEmitAction,
  takeFromLigrettoDeckAction,
  takeFromStackDeckAction,
  leaveFromRoomEmitAction,
  connectToRoomSuccessAction,
  endRoundAction,
  updateGameAction,
} from '@memebattle/ligretto-shared'

import {
  setGameLoadedAction,
  setGameResultAction,
  startGameAction,
  togglePlayerStatusAction,
  updateGameAction as updateGameSliceAction,
  tapCardAction,
  tapStackOpenDeckCardAction,
  tapStackDeckCardAction,
  tapLigrettoDeckCardAction,
  leaveGameAction,
} from './slice'
import { gameIdSelector, playerStatusSelector } from './selectors'

function* gameUpdateSaga(action: ReturnType<typeof updateGameAction>) {
  const game = action.payload
  yield put(updateGameSliceAction(game))
}

function* togglePlayerStatusSaga() {
  const currentStatus: ReturnType<typeof playerStatusSelector> = yield select(playerStatusSelector)
  const gameId: ReturnType<typeof gameIdSelector> = yield select(gameIdSelector)

  const status = currentStatus === PlayerStatus.DontReadyToPlay ? PlayerStatus.ReadyToPlay : PlayerStatus.DontReadyToPlay

  yield put(setPlayerStatusEmitAction({ status, gameId }))
}

function* connectToRoomSuccessSaga(action: ReturnType<typeof connectToRoomSuccessAction>) {
  yield put(updateGameSliceAction(action.payload.game))
  yield put(setGameLoadedAction(true))
}

function* startGameSaga() {
  const gameId: ReturnType<typeof gameIdSelector> = yield select(gameIdSelector)
  yield put(startGameEmitAction({ gameId }))
}

function* cardsRowPutSaga({ payload }: ReturnType<typeof tapCardAction>) {
  const gameId: ReturnType<typeof gameIdSelector> = yield select(gameIdSelector)

  yield put(putCardAction({ cardIndex: payload.cardIndex, gameId, playgroundDeckIndex: payload.playgroundDeckIndex }))
}

function* tapStackOpenDeckCardActionSaga({ payload }: ReturnType<typeof tapStackOpenDeckCardAction>) {
  const gameId: ReturnType<typeof gameIdSelector> = yield select(gameIdSelector)

  yield put(putCardFromStackOpenDeck({ gameId, playgroundDeckIndex: payload?.playgroundDeckIndex }))
}

function* tapStackDeckCardActionSaga() {
  const gameId: ReturnType<typeof gameIdSelector> = yield select(gameIdSelector)

  yield put(takeFromStackDeckAction({ gameId }))
}

function* tapLigrettoDeckCardActionSaga() {
  const gameId: ReturnType<typeof gameIdSelector> = yield select(gameIdSelector)

  yield put(takeFromLigrettoDeckAction({ gameId }))
}

function* endRoundSaga({ payload }: ReturnType<typeof endRoundAction>) {
  yield put(setGameResultAction(payload))
}

function* leaveGameSaga() {
  yield put(leaveFromRoomEmitAction())
}

export function* gameRootSaga() {
  yield takeLatest(updateGameAction, gameUpdateSaga)
  yield takeLatest(togglePlayerStatusAction, togglePlayerStatusSaga)
  yield takeLatest(startGameAction, startGameSaga)
  yield takeEvery(tapCardAction, cardsRowPutSaga)
  yield takeEvery(tapStackOpenDeckCardAction, tapStackOpenDeckCardActionSaga)
  yield takeEvery(tapStackDeckCardAction, tapStackDeckCardActionSaga)
  yield takeEvery(tapLigrettoDeckCardAction, tapLigrettoDeckCardActionSaga)
  yield takeEvery(endRoundAction, endRoundSaga)
  yield takeLatest(connectToRoomSuccessAction, connectToRoomSuccessSaga)
  yield takeLatest(leaveGameAction, leaveGameSaga)
}
