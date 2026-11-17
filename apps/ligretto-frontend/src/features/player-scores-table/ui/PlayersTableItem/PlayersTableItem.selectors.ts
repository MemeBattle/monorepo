import { createSelector } from '@reduxjs/toolkit'

import { canKickParticipantsSelector, gamePlayersSelector, gameResultsSelector } from '#ducks/game'
import { userAvatarUrl, userLabel, usersMapSelector } from '#ducks/users'
import { currentUserIdSelector } from '#ducks/auth'
import { getRandomAvatar } from '#shared/ui/Avatar/getRandomAvatar'
import type { All } from '#types/store'

import type { PlayersScoresTablePlayer } from '../PlayerScoreRow/PlayerScoreRow'

const playerIdArg = (_state: All, playerId: string) => playerId

export const playerRowSelector = createSelector(
  [gamePlayersSelector, gameResultsSelector, usersMapSelector, currentUserIdSelector, playerIdArg],
  (players, gameResults, users, currentUserId, playerId): PlayersScoresTablePlayer | undefined => {
    const player = players[playerId]
    if (!player) {
      return undefined
    }
    const user = users[playerId]
    const playerResults = gameResults?.[playerId] || { roundScore: 0, gameScore: 0 }

    return {
      id: playerId,
      username: user ? userLabel(user) : '',
      avatar: user ? userAvatarUrl(user) : getRandomAvatar(playerId),
      roundPoints: [playerResults.roundScore],
      totalPoints: playerResults.gameScore,
      isPlayer: playerId === currentUserId,
      isHost: player.isHost,
      status: player.status,
    }
  },
)

export const canKickPlayerSelector = createSelector(
  [canKickParticipantsSelector, currentUserIdSelector, playerIdArg],
  (canKick, currentUserId, playerId) => canKick && playerId !== currentUserId,
)
