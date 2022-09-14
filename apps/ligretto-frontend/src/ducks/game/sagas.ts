import { call, put, select, takeEvery, takeLatest } from 'redux-saga/effects'
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

import type { SelectedCardIndex } from './slice'
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
  setSelectedCardIndexAction,
  tapPlaygroundCardAction,
} from './slice'
import { gameIdSelector, isDndEnabledSelector, playerStatusSelector, selectedCardIndexSelector, selectPlayerCardByIndex } from './selectors'
import { STACK_OPEN_DECK_INDEX } from './utils'

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

function* setSelectedCardIndexSaga(cardIndex: SelectedCardIndex) {
  const selectedCardIndex: ReturnType<typeof selectedCardIndexSelector> = yield select(selectedCardIndexSelector)
  const cardToSelect: ReturnType<typeof selectPlayerCardByIndex> = yield select(selectPlayerCardByIndex, cardIndex)

  if (cardIndex === selectedCardIndex || !cardToSelect) {
    yield put(setSelectedCardIndexAction(undefined))
  } else {
    yield put(setSelectedCardIndexAction(cardIndex))
  }
}

function* tapCardSaga({ payload }: ReturnType<typeof tapCardAction>) {
  const gameId: ReturnType<typeof gameIdSelector> = yield select(gameIdSelector)
  const isDndEnabled: ReturnType<typeof isDndEnabledSelector> = yield select(isDndEnabledSelector)
  const tappedCard: ReturnType<typeof selectPlayerCardByIndex> = yield select(selectPlayerCardByIndex, payload.cardIndex)

  if (!isDndEnabled || tappedCard?.value === 1) {
    yield put(putCardAction({ cardIndex: payload.cardIndex, gameId }))
  } else {
    yield call(setSelectedCardIndexSaga, payload.cardIndex)
  }
}

function* tapStackOpenDeckCardActionSaga() {
  const gameId: ReturnType<typeof gameIdSelector> = yield select(gameIdSelector)
  const isDndEnabled: ReturnType<typeof isDndEnabledSelector> = yield select(isDndEnabledSelector)
  const tappedCard: ReturnType<typeof selectPlayerCardByIndex> = yield select(selectPlayerCardByIndex, STACK_OPEN_DECK_INDEX)

  if (!isDndEnabled || tappedCard?.value === 1) {
    yield put(putCardFromStackOpenDeck({ gameId }))
  } else {
    yield call(setSelectedCardIndexSaga, STACK_OPEN_DECK_INDEX)
  }
}

function* tapStackDeckCardActionSaga() {
  const gameId: ReturnType<typeof gameIdSelector> = yield select(gameIdSelector)

  yield put(takeFromStackDeckAction({ gameId }))
}

function* tapLigrettoDeckCardActionSaga() {
  const gameId: ReturnType<typeof gameIdSelector> = yield select(gameIdSelector)

  yield put(takeFromLigrettoDeckAction({ gameId }))
}

function* tapPlaygroundDeckActionSaga({ payload }: ReturnType<typeof tapPlaygroundCardAction>) {
  const gameId: ReturnType<typeof gameIdSelector> = yield select(gameIdSelector)
  const isDndEnabled: ReturnType<typeof isDndEnabledSelector> = yield select(isDndEnabledSelector)
  const selectedCardIndex: ReturnType<typeof selectedCardIndexSelector> = yield select(selectedCardIndexSelector)

  if (!isDndEnabled) {
    return
  }

  if (selectedCardIndex === STACK_OPEN_DECK_INDEX) {
    yield put(putCardFromStackOpenDeck({ gameId, playgroundDeckIndex: payload.deckPosition }))
  } else if (typeof selectedCardIndex === 'number') {
    yield put(putCardAction({ cardIndex: selectedCardIndex, gameId, playgroundDeckIndex: payload.deckPosition }))
    yield put(setSelectedCardIndexAction(undefined))
  }
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
  yield takeEvery(tapCardAction, tapCardSaga)
  yield takeEvery(tapStackOpenDeckCardAction, tapStackOpenDeckCardActionSaga)
  yield takeEvery(tapStackDeckCardAction, tapStackDeckCardActionSaga)
  yield takeEvery(tapLigrettoDeckCardAction, tapLigrettoDeckCardActionSaga)
  yield takeEvery(tapPlaygroundCardAction, tapPlaygroundDeckActionSaga)
  yield takeEvery(endRoundAction, endRoundSaga)
  yield takeLatest(connectToRoomSuccessAction, connectToRoomSuccessSaga)
  yield takeLatest(leaveGameAction, leaveGameSaga)
}
