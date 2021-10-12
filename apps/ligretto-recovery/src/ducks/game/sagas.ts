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
import { selectGameId, selectPlayerStatus } from './selectors'

function* gameUpdateSaga(action: ReturnType<typeof updateGameAction>) {
  const game = action.payload
  yield put(updateGameSliceAction(game))
}

function* togglePlayerStatusSaga() {
  const currentStatus: ReturnType<typeof selectPlayerStatus> = yield select(selectPlayerStatus)
  const gameId: ReturnType<typeof selectGameId> = yield select(selectGameId)

  const status = currentStatus === PlayerStatus.DontReadyToPlay ? PlayerStatus.ReadyToPlay : PlayerStatus.DontReadyToPlay

  yield put(setPlayerStatusEmitAction({ status, gameId }))
}

function* connectToRoomSuccessSaga(action: ReturnType<typeof connectToRoomSuccessAction>) {
  yield put(updateGameSliceAction(action.payload.game))
  yield put(setGameLoadedAction(true))
}

function* startGameSaga() {
  const gameId: ReturnType<typeof selectGameId> = yield select(selectGameId)
  yield put(startGameEmitAction({ gameId }))
}

function* cardsRowPutSaga({ payload }: ReturnType<typeof tapCardAction>) {
  const gameId: ReturnType<typeof selectGameId> = yield select(selectGameId)

  yield put(putCardAction({ cardIndex: payload.cardIndex, gameId }))
}

function* tapStackOpenDeckCardActionSaga() {
  const gameId: ReturnType<typeof selectGameId> = yield select(selectGameId)

  yield put(putCardFromStackOpenDeck({ gameId }))
}

function* tapStackDeckCardActionSaga() {
  const gameId: ReturnType<typeof selectGameId> = yield select(selectGameId)

  yield put(takeFromStackDeckAction({ gameId }))
}

function* tapLigrettoDeckCardActionSaga() {
  const gameId: ReturnType<typeof selectGameId> = yield select(selectGameId)

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
