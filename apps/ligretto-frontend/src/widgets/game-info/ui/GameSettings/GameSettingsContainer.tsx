import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router'
import { createSelector } from '@reduxjs/toolkit'

import { routes } from '#shared/constants'
import {
  gameIdSelector,
  gameNameSelector,
  gameStatusSelector,
  isGameReadyToStartSelector,
  playerSelector,
  playersIdsSelector,
  playersMaxCountSelector,
  resumeGameAction,
  spectatorsSelector,
  startGameAction,
  togglePlayerStatusAction,
} from '#ducks/game'
import { userAvatarUrl, userLabel, usersMapSelector } from '#ducks/users'
import { currentUserIdSelector } from '#ducks/auth'
import { getRandomAvatar } from '#shared/ui/Avatar/getRandomAvatar'
import { becomeSpectatorEmitAction, GameStatus, PlayerStatus } from '@memebattle/ligretto-shared'

import { GameSettings } from './GameSettings'
import type { GameSettingsSpectator } from './GameSettings'

const spectatorsListSelector = createSelector([spectatorsSelector, usersMapSelector, currentUserIdSelector], (spectators, users, currentUserId) =>
  Object.keys(spectators).map((id): GameSettingsSpectator => {
    const user = users[id]
    return {
      id,
      username: user ? userLabel(user) : '',
      avatar: user ? userAvatarUrl(user) : getRandomAvatar(id),
      isViewer: id === currentUserId,
    }
  }),
)

const isBetweenRounds = (gameStatus: GameStatus) => gameStatus === GameStatus.New || gameStatus === GameStatus.RoundFinished

export const GameSettingsContainer = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const gameId = useSelector(gameIdSelector)
  const gameName = useSelector(gameNameSelector)
  const gameStatus = useSelector(gameStatusSelector)
  const currentPlayer = useSelector(playerSelector)
  const isGameReadyToStart = useSelector(isGameReadyToStartSelector)
  const playersCount = useSelector(playersIdsSelector).length
  const playersMaxCount = useSelector(playersMaxCountSelector)
  const spectators = useSelector(spectatorsListSelector)

  const handleReadyClick = useCallback(() => {
    dispatch(togglePlayerStatusAction())
  }, [dispatch])

  const handleStartClick = useCallback(() => {
    dispatch(gameStatus === GameStatus.Pause ? resumeGameAction() : startGameAction())
  }, [dispatch, gameStatus])

  const handleSpectateClick = useCallback(() => {
    dispatch(becomeSpectatorEmitAction({ gameId }))
  }, [dispatch, gameId])

  const handleExitClick = useCallback(() => {
    navigate(routes.HOME)
  }, [navigate])

  return (
    <GameSettings
      gameStatus={gameStatus}
      gameName={gameName}
      playersCount={playersCount}
      playersMaxCount={playersMaxCount}
      spectators={spectators}
      canStartGame={currentPlayer?.isHost ?? false}
      canToggleReady={!!currentPlayer && currentPlayer.status !== PlayerStatus.Disconnected && isBetweenRounds(gameStatus)}
      canSpectate={!!currentPlayer && !currentPlayer.isHost && isBetweenRounds(gameStatus)}
      onSpectateClick={handleSpectateClick}
      onReadyClick={handleReadyClick}
      onStartClick={handleStartClick}
      onExitClick={handleExitClick}
      isStartDisabled={!isGameReadyToStart}
      isPlayerReadyToPlay={currentPlayer?.status === PlayerStatus.ReadyToPlay}
    />
  )
}
