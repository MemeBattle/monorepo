import type { TypedStartListening, Dispatch } from '@reduxjs/toolkit'
import { TaskAbortError } from '@reduxjs/toolkit'
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
  resetGameStateAction,
} from './slice'
import { gameIdSelector, isDndEnabledSelector, playerStatusSelector, selectedCardIndexSelector, selectPlayerCardByIndex } from './selectors'
import { STACK_OPEN_DECK_INDEX } from './utils'
import { matchPath } from 'react-router-dom'
import { routes } from '#shared/constants'
import { LOCATION_CHANGE, push } from 'redux-first-history'
import { socketConnectedAction } from '#entities/socket'
import { locationSelector } from '#ducks/router'
import { connectToRoomAction } from '#ducks/rooms'
import type { All } from '#types/store.js'

function setSelectedCardIndex(cardIndex: SelectedCardIndex, state: All, dispatch: Dispatch) {
  const selectedCardIndex = selectedCardIndexSelector(state)
  const cardToSelect = selectPlayerCardByIndex(state, cardIndex)

  if (cardIndex === selectedCardIndex || !cardToSelect) {
    dispatch(setSelectedCardIndexAction(undefined))
  } else {
    dispatch(setSelectedCardIndexAction(cardIndex))
  }
}

export function addListeners(startListener: TypedStartListening<All>) {
  startListener({
    predicate: action => action.type === LOCATION_CHANGE || socketConnectedAction.match(action),
    effect: async (action, listenerApi) => {
      listenerApi.cancelActiveListeners()
      const state = listenerApi.getState()
      try {
        const location = locationSelector(state)

        const match = location?.pathname && matchPath(routes.GAME, location.pathname)

        if (match) {
          const roomUuid = match.params.roomUuid

          if (!roomUuid) {
            listenerApi.dispatch(push(routes.HOME))
            return
          }
          listenerApi.dispatch(connectToRoomAction({ roomUuid }))
          await listenerApi.take(action => action.type === LOCATION_CHANGE)
        }
      } catch (e) {
        if (e instanceof TaskAbortError) {
          const newLocation = locationSelector(state)
          const match = newLocation?.pathname && matchPath(routes.GAME, newLocation.pathname)
          if (!match) {
            listenerApi.dispatch(leaveFromRoomEmitAction())
            listenerApi.dispatch(resetGameStateAction())
          }
        }
      }
    },
  })

  startListener({
    actionCreator: updateGameAction,
    effect: (action, listenerApi) => {
      listenerApi.dispatch(updateGameSliceAction(action.payload))
    },
  })

  startListener({
    actionCreator: endRoundAction,
    effect: ({ payload }, listenerApi) => {
      listenerApi.dispatch(setGameResultAction(payload))
    },
  })

  startListener({
    actionCreator: connectToRoomSuccessAction,
    effect: (action, listenerApi) => {
      listenerApi.dispatch(updateGameSliceAction(action.payload.game))
      listenerApi.dispatch(setGameLoadedAction(true))
    },
  })

  startListener({
    actionCreator: tapLigrettoDeckCardAction,
    effect: (_action, listenerApi) => {
      const gameId = gameIdSelector(listenerApi.getState())

      listenerApi.dispatch(takeFromLigrettoDeckAction({ gameId }))
    },
  })

  startListener({
    actionCreator: tapStackDeckCardAction,
    effect: (_action, listenerApi) => {
      const gameId = gameIdSelector(listenerApi.getState())

      listenerApi.dispatch(takeFromStackDeckAction({ gameId }))
    },
  })

  startListener({
    actionCreator: togglePlayerStatusAction,
    effect: (_action, listenerApi) => {
      const state = listenerApi.getState()

      const currentStatus = playerStatusSelector(state)
      const gameId = gameIdSelector(state)

      const status = currentStatus === PlayerStatus.DontReadyToPlay ? PlayerStatus.ReadyToPlay : PlayerStatus.DontReadyToPlay

      listenerApi.dispatch(setPlayerStatusEmitAction({ status, gameId }))
    },
  })

  startListener({
    actionCreator: startGameAction,
    effect: (_action, listenerApi) => {
      const state = listenerApi.getState()

      const gameId = gameIdSelector(state)

      listenerApi.dispatch(startGameEmitAction({ gameId }))
    },
  })

  startListener({
    actionCreator: tapCardAction,
    effect: ({ payload }, listenerApi) => {
      const state = listenerApi.getState()

      const gameId = gameIdSelector(state)

      const isDndEnabled = isDndEnabledSelector(state)
      const tappedCard = selectPlayerCardByIndex(state, payload.cardIndex)

      if (!isDndEnabled || tappedCard?.value === 1) {
        listenerApi.dispatch(putCardAction({ cardIndex: payload.cardIndex, gameId }))
      } else {
        setSelectedCardIndex(payload.cardIndex, state, listenerApi.dispatch)
      }
    },
  })

  startListener({
    actionCreator: tapStackOpenDeckCardAction,
    effect: (_action, listenerApi) => {
      const state = listenerApi.getState()

      const gameId = gameIdSelector(state)

      const isDndEnabled = isDndEnabledSelector(state)
      const tappedCard = selectPlayerCardByIndex(state, STACK_OPEN_DECK_INDEX)

      if (!isDndEnabled || tappedCard?.value === 1) {
        listenerApi.dispatch(putCardFromStackOpenDeck({ gameId }))
      } else {
        setSelectedCardIndex(STACK_OPEN_DECK_INDEX, state, listenerApi.dispatch)
      }
    },
  })

  startListener({
    actionCreator: tapPlaygroundCardAction,
    effect: ({ payload }, listenerApi) => {
      const state = listenerApi.getState()

      const gameId = gameIdSelector(state)

      const isDndEnabled = isDndEnabledSelector(state)
      const selectedCardIndex = selectedCardIndexSelector(state)

      if (!isDndEnabled) {
        return
      }

      if (selectedCardIndex === STACK_OPEN_DECK_INDEX) {
        listenerApi.dispatch(putCardFromStackOpenDeck({ gameId, playgroundDeckIndex: payload.deckPosition }))
      } else if (typeof selectedCardIndex === 'number') {
        listenerApi.dispatch(putCardAction({ cardIndex: selectedCardIndex, gameId, playgroundDeckIndex: payload.deckPosition }))
        listenerApi.dispatch(setSelectedCardIndexAction(undefined))
      }
    },
  })
}
