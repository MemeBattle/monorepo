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

/**
 * Fields, not the player object: every server update replaces each player with a new object, changed or not, so only
 * the values the row shows say whether it changed.
 */
const playerIsHostSelector = (state: All, playerId: string) => gamePlayersSelector(state)[playerId]?.isHost
const playerStatusSelector = (state: All, playerId: string) => gamePlayersSelector(state)[playerId]?.status
const playerRoundScoreSelector = (state: All, playerId: string) => gameResultsSelector(state)?.[playerId]?.roundScore ?? 0
const playerGameScoreSelector = (state: All, playerId: string) => gameResultsSelector(state)?.[playerId]?.gameScore ?? 0
const playerUserSelector = (state: All, playerId: string) => usersMapSelector(state)[playerId]
const isViewerSelector = (state: All, playerId: string) => currentUserIdSelector(state) === playerId

export const playerRowSelector = createSelector(
  [playerIsHostSelector, playerStatusSelector, playerRoundScoreSelector, playerGameScoreSelector, playerUserSelector, isViewerSelector, playerIdArg],
  (isHost, status, roundScore, gameScore, user, isViewer, playerId): PlayerScore | undefined =>
    isHost === undefined || status === undefined
      ? undefined
      : {
          username: user ? userLabel(user) : '',
          avatar: user ? userAvatarUrl(user) : getRandomAvatar(playerId),
          roundScore,
          gameScore,
          isViewer,
          isHost,
          status,
        },
)

export const canKickPlayerSelector = createSelector(
  [canKickParticipantsSelector, currentUserIdSelector, playerIdArg],
  (canKick, currentUserId, playerId) => canKick && playerId !== currentUserId,
)
