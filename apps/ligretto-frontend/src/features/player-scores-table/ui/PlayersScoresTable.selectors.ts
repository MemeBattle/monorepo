import { createSelector } from '@reduxjs/toolkit'
import orderBy from 'lodash/orderBy'
import { GameStatus } from '@memebattle/ligretto-shared'

import { gamePlayersSelector, gameResultsSelector, gameStatusSelector, playersIdsSelector, playersMaxCountSelector } from '#ducks/game'
import { userAvatarUrl, userLabel, usersMapSelector } from '#ducks/users'
import { currentUserIdSelector } from '#ducks/auth'
import { getRandomAvatar } from '#shared/ui/Avatar/getRandomAvatar'

import type { PlayersScoresTablePlayer } from './PlayersScoresTable'

export const playersSelector = createSelector(
  [gamePlayersSelector, gameResultsSelector, usersMapSelector, currentUserIdSelector],
  (players, gameResults, users, currentPlayerId): PlayersScoresTablePlayer[] =>
    orderBy(
      Object.keys(players).map(playerId => {
        const user = users[playerId]
        const player = players[playerId]
        const playerResults = gameResults?.[playerId] || { roundScore: 0, gameScore: 0 }

        return {
          id: playerId,
          username: user ? userLabel(user) : '',
          avatar: user ? userAvatarUrl(user) : getRandomAvatar(playerId),
          roundPoints: [playerResults.roundScore],
          totalPoints: playerResults.gameScore,
          isPlayer: playerId === currentPlayerId,
          isHost: player?.isHost,
          status: player?.status,
        }
      }),
      'totalPoints',
      'desc',
    ),
)

/** Newcomers take a seat only between rounds; during a round they join as spectators. */
export const freeSeatsCountSelector = createSelector(
  [gameStatusSelector, playersIdsSelector, playersMaxCountSelector],
  (gameStatus, playersIds, playersMaxCount) =>
    gameStatus === GameStatus.New || gameStatus === GameStatus.RoundFinished ? Math.max(0, playersMaxCount - playersIds.length) : 0,
)
