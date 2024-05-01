import { useSelector } from 'react-redux'
import { createSelector } from '@reduxjs/toolkit'
import { GameStatus } from '@memebattle/ligretto-shared'

import { gameStatusSelector, isGameLoadedSelector } from '#ducks/game'
import { GameSettingsModal } from '#widgets/game-info'
import { GameLayout } from '#shared/ui/layouts/game/GameLayout'
import { GameContainer } from '#widgets/game'
import { Opponent } from '#features/player'

const gamePageContainerSelector = createSelector([gameStatusSelector, isGameLoadedSelector], (gameStatus, isGameLoaded) => ({
  gameStatus,
  isGameLoaded,
}))

const activeModalStatuses = new Set([GameStatus.New, GameStatus.Pause, GameStatus.RoundFinished])

export const GamePage = () => {
  const { gameStatus, isGameLoaded } = useSelector(gamePageContainerSelector)

  if (!isGameLoaded) {
    return <>loading</>
  }

  return (
    <GameLayout>
      <GameContainer />
      <GameSettingsModal isOpen={activeModalStatuses.has(gameStatus)} />
    </GameLayout>
  )
}
