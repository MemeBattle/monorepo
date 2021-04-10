import { call, put, select, takeEvery, takeLatest } from 'redux-saga/effects'
import { opponentToCardsMapper, playerToCardsMapper, tableCardsMapper } from 'utils'
import { without } from 'lodash'
import type { Card, Game, Player, CardPositions } from '@memebattle/ligretto-shared'
import {
  GameStatus,
  OpponentPositions,
  PlayerStatus,
  putCardAction,
  putCardFromStackOpenDeck,
  setPlayerStatusEmitAction,
  startGameEmitAction,
  takeFromLigrettoDeckAction,
  takeFromStackDeckAction,
  createRoomSuccessAction,
  connectToRoomSuccessAction,
  endRoundAction,
  updateGameAction,
} from '@memebattle/ligretto-shared'
import {
  setGameLoadedAction,
  setGameResultAction,
  setPlayerIdAction,
  startGameAction,
  togglePlayerStatusAction,
  updateGameAction as updateGameSliceAction,
  tapCardAction,
  tapStackOpenDeckCardAction,
  tapStackDeckCardAction,
  tapLigrettoDeckCardAction,
} from './slice'
import { selectGameId, selectPlayerId, selectPlayerStatus } from './selectors'
import { cardsActions } from 'ducks/cards'

const opponentsPositionsOrder = [OpponentPositions.Left, OpponentPositions.Top, OpponentPositions.Right]

/**
 * @draft - maybe id instead of color usage will be correctly
 */
function* gameCardsUpdate(game: Game) {
  const playerId: Player['id'] = yield select(selectPlayerId)

  const players = Object.values(game.players)
  const player = game.players[playerId]
  if (player === undefined) {
    return
  }

  const tableCards = tableCardsMapper(
    game.playground.decks.filter(cardsDeck => !cardsDeck.isHidden).map(cardDeck => cardDeck.cards[cardDeck.cards.length - 1]),
  )

  const opponentsCardsByPositions = without(players, player).reduce(
    (opponentCardsByPositions, opponent, opponentIndex) => ({
      ...opponentCardsByPositions,
      ...opponentToCardsMapper(opponent, opponentsPositionsOrder[opponentIndex]),
    }),
    {},
  )

  const cards: Partial<Record<CardPositions, Card>> = {
    ...playerToCardsMapper(player),
    ...opponentsCardsByPositions,
    ...tableCards,
  }

  yield put(cardsActions.pushCardsAction(cards))
}

function* gameUpdateSaga(action: ReturnType<typeof updateGameAction>) {
  const game = action.payload
  yield put(updateGameSliceAction(game))

  if (game.status === GameStatus.InGame) {
    yield call(gameCardsUpdate, action.payload)
  }
}

function* togglePlayerStatusSaga() {
  const currentStatus = yield select(selectPlayerStatus)
  const gameId = yield select(selectGameId)

  const status = currentStatus === PlayerStatus.DontReadyToPlay ? PlayerStatus.ReadyToPlay : PlayerStatus.DontReadyToPlay

  yield put(setPlayerStatusEmitAction({ status, gameId }))
}

function* connectToRoomSuccessSaga(action: ReturnType<typeof connectToRoomSuccessAction> | ReturnType<typeof createRoomSuccessAction>) {
  yield put(updateGameSliceAction(action.payload.game))
  yield put(setPlayerIdAction(action.payload.playerId))
  yield put(setGameLoadedAction(true))
}

function* startGameSaga() {
  const gameId = yield select(selectGameId)
  yield put(startGameEmitAction({ gameId }))
}

function* cardsRowPutSaga({ payload }: ReturnType<typeof tapCardAction>) {
  const gameId = yield select(selectGameId)

  yield put(putCardAction({ cardIndex: payload.cardIndex, gameId }))
}

function* tapStackOpenDeckCardActionSaga() {
  const gameId = yield select(selectGameId)

  yield put(putCardFromStackOpenDeck({ gameId }))
}

function* tapStackDeckCardActionSaga() {
  const gameId = yield select(selectGameId)

  yield put(takeFromStackDeckAction({ gameId }))
}

function* tapLigrettoDeckCardActionSaga() {
  const gameId = yield select(selectGameId)

  yield put(takeFromLigrettoDeckAction({ gameId }))
}

function* endRoundSaga({ payload }: ReturnType<typeof endRoundAction>) {
  yield put(setGameResultAction(payload))
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
  yield takeLatest([connectToRoomSuccessAction, createRoomSuccessAction], connectToRoomSuccessSaga)
}
