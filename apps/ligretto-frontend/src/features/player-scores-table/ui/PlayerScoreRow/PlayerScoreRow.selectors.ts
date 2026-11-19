import { createSelector } from '@reduxjs/toolkit'

import { canKickParticipantsSelector, gamePlayersSelector, gameResultsSelector } from '#ducks/game'
import { userAvatarUrl, userLabel, usersMapSelector } from '#ducks/users'
import { currentUserIdSelector } from '#ducks/auth'
import { getRandomAvatar } from '#shared/ui/Avatar/getRandomAvatar'
import type { PlayerStatus } from '@memebattle/ligretto-shared'
import type { All } from '#types/store'

interface PlayerScore {
  username: string
  avatar: string
  roundScore: number
  gameScore: number
  isViewer: boolean
  isHost: boolean
  status: PlayerStatus
}

const playerIdArg = (_state: All, playerId: string) => playerId

export const playerRowSelector = createSelector(
  [gamePlayersSelector, gameResultsSelector, usersMapSelector, currentUserIdSelector, playerIdArg],
  (players, gameResults, users, currentUserId, playerId): PlayerScore | undefined => {
    const player = players[playerId]
    if (!player) {
      return undefined
    }
    const user = users[playerId]
    const playerResults = gameResults?.[playerId]

    return {
      username: user ? userLabel(user) : '',
      avatar: user ? userAvatarUrl(user) : getRandomAvatar(playerId),
      roundScore: playerResults?.roundScore ?? 0,
      gameScore: playerResults?.gameScore ?? 0,
      isViewer: playerId === currentUserId,
      isHost: player.isHost,
      status: player.status,
    }
  },
)

export const canKickPlayerSelector = createSelector(
  [canKickParticipantsSelector, currentUserIdSelector, playerIdArg],
  (canKick, currentUserId, playerId) => canKick && playerId !== currentUserId,
)
