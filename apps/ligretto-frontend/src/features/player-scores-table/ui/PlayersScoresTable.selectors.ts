import { createSelector } from '@reduxjs/toolkit'
import orderBy from 'lodash/orderBy'
import { GameStatus } from '@memebattle/ligretto-shared'

import { gameResultsSelector, gameStatusSelector, playersIdsSelector, playersMaxCountSelector } from '#ducks/game'

/** The leader first. */
export const rankedPlayerIdsSelector = createSelector([playersIdsSelector, gameResultsSelector], (playerIds, gameResults) =>
  orderBy(playerIds, playerId => gameResults?.[playerId]?.gameScore ?? 0, 'desc'),
)

/** Newcomers take a seat only between rounds; during a round they join as spectators. */
export const freeSeatsCountSelector = createSelector(
  [gameStatusSelector, playersIdsSelector, playersMaxCountSelector],
  (gameStatus, playersIds, playersMaxCount) =>
    gameStatus === GameStatus.New || gameStatus === GameStatus.RoundFinished ? Math.max(0, playersMaxCount - playersIds.length) : 0,
)
