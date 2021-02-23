import { call, put, select, takeEvery, takeLatest } from 'redux-saga/effects'
import { opponentToCardsMapper, playerToCardsMapper, tableCardsMapper } from 'utils'
import { without } from 'lodash'
import type {
  Card,
  ConnectToRoomSuccessAction,
  CreateRoomSuccessAction,
  Game,
  Player,
  EndRoundAction,
  UpdateGameAction,
} from '@memebattle/ligretto-shared'
import {
  CardPositions,
  GameStatus,
  GameTypes as SharedGameTypes,
  OpponentPositions,
  PlayerStatus,
  GameplayTypes,
  putCardAction,
  putCardFromStackOpenDeck,
  RoomsTypes as SharedRoomTypes,
  setPlayerStatusEmitAction,
  startGameEmitAction,
  takeFromLigrettoDeckAction,
  takeFromStackDeckAction,
} from '@memebattle/ligretto-shared'
import { setGameLoadedAction, setGameResultAction, setPlayerIdAction, updateGameAction } from './slice'
import { selectGameId, selectPlayerId, selectPlayerStatus } from './selectors'
import { cardsActions, CardsTypes } from 'ducks/cards'
import { GameTypes } from './slice'

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

function* gameUpdateSaga(action: UpdateGameAction) {
  const game = action.payload
  yield put(updateGameAction(game))

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

function* connectToRoomSuccessSaga(action: ConnectToRoomSuccessAction | CreateRoomSuccessAction) {
  yield put(updateGameAction(action.payload.game))
  yield put(setPlayerIdAction(action.payload.playerId))
  yield put(setGameLoadedAction(true))
}

function* startGameSaga() {
  const gameId = yield select(selectGameId)
  yield put(startGameEmitAction({ gameId }))
}

function* handleCardPutSaga(action: CardsTypes.TapCardAction) {
  const gameId = yield select(selectGameId)
  switch (action.payload.cardPosition) {
    case CardPositions.q:
      yield put(putCardFromStackOpenDeck({ gameId }))
      break
    case CardPositions.w:
      yield put(takeFromStackDeckAction({ gameId }))
      break
    case CardPositions.e:
      yield put(putCardAction({ cardIndex: 0, gameId }))
      break
    case CardPositions.r:
      yield put(putCardAction({ cardIndex: 1, gameId }))
      break
    case CardPositions.t:
      yield put(putCardAction({ cardIndex: 2, gameId }))
      break
    case CardPositions.y:
      yield put(takeFromLigrettoDeckAction({ gameId }))
  }
}

function* endRoundSaga({ payload }: EndRoundAction) {
  yield put(setGameResultAction(payload))
}

export function* gameRootSaga() {
  yield takeLatest(SharedGameTypes.UPDATE_GAME, gameUpdateSaga)
  yield takeLatest(GameTypes.TOGGLE_PLAYER_STATUS, togglePlayerStatusSaga)
  yield takeLatest(GameTypes.START_GAME, startGameSaga)
  yield takeEvery(CardsTypes.CardsTypes.TAP_CARD, handleCardPutSaga)
  yield takeEvery(GameplayTypes.END_ROUND, endRoundSaga)
  yield takeLatest([SharedRoomTypes.CONNECT_TO_ROOM_SUCCESS, SharedRoomTypes.CREATE_ROOM_SUCCESS], connectToRoomSuccessSaga)
}
