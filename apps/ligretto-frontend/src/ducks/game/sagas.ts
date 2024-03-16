import { call, put, select, takeEvery, takeLatest, take, cancelled } from 'redux-saga/effects'
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
  setSelectedCardIndexAction,
  tapPlaygroundCardAction,
} from './slice'
import { gameIdSelector, isDndEnabledSelector, playerStatusSelector, selectedCardIndexSelector, selectPlayerCardByIndex } from './selectors'
import { STACK_OPEN_DECK_INDEX } from './utils'
import { matchPath } from 'react-router-dom'
import { routes } from '#shared/constants'
import { LOCATION_CHANGE, push } from 'redux-first-history'
import { socketConnectedAction } from '#entities/socket'
import { locationSelector } from '#ducks/router'
import { connectToRoomAction } from '#ducks/rooms'

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

function* handleLocationChangeSaga() {
  try {
    const location: ReturnType<typeof locationSelector> = yield select(locationSelector)

    const match = location?.pathname && matchPath(routes.GAME, location.pathname)

    if (match) {
      const roomUuid = match.params.roomUuid

      if (!roomUuid) {
        yield put(push(routes.HOME))
        return
      }
      yield put(connectToRoomAction({ roomUuid }))
      yield take(LOCATION_CHANGE)
    }
  } finally {
    // @ts-expect-error TS7057 'yield' expression implicitly results in an 'any' type because its containing generator lacks a return-type annotation.
    if (yield cancelled()) {
      const newLocation: ReturnType<typeof locationSelector> = yield select(locationSelector)
      const match = newLocation?.pathname && matchPath(routes.GAME, newLocation.pathname)
      if (!match) {
        yield put(leaveFromRoomEmitAction())
      }
    }
  }
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
  yield takeLatest([LOCATION_CHANGE, socketConnectedAction], handleLocationChangeSaga)
}
