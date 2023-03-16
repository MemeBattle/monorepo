import React from 'react'
import { useSelector } from 'react-redux'
import { createSelector } from '@reduxjs/toolkit'
import { GameStatus } from '@memebattle/ligretto-shared'

import { ScreenCountdown } from 'components/blocks/game/ScreenCountdown'

import { GameGrid } from 'components/blocks/game/GameGrid'
import { PlaygroundContainer } from 'containers/playground'
import { CardsPanelContainer } from 'containers/CardsPanelContainer'
import { Opponent } from 'components/blocks/game/opponent'
import { gameStatusSelector, isGameLoadedSelector, isPlayerSpectatorSelector, startingDelayInSecSelector, opponentsSelector } from 'ducks/game'
import { GameSettingsModal } from 'components/blocks/game/GameSettingsModal/GameSettingsModal'

const gamePageContainerSelector = createSelector(
  [gameStatusSelector, isGameLoadedSelector, isPlayerSpectatorSelector, startingDelayInSecSelector, opponentsSelector],
  (gameStatus, isGameLoaded, isPlayerSpectator, startingDelayInSec, opponents) => ({
    gameStatus,
    isGameLoaded,
    isPlayerSpectator,
    startingDelayInSec,
    opponents,
  }),
)
export const GamePageContainer = () => {
  const { gameStatus, isGameLoaded, isPlayerSpectator, startingDelayInSec, opponents } = useSelector(gamePageContainerSelector)

  if (!isGameLoaded) {
    return <>loading</>
  }

  return (
    <>
      {gameStatus === GameStatus.Starting && <ScreenCountdown timeToGo={startingDelayInSec} />}
      <GameGrid centerElement={<PlaygroundContainer />} bottomElement={isPlayerSpectator ? null : <CardsPanelContainer />}>
        {opponents.map(opponent => (
          <Opponent
            id={opponent.id}
            avatar={opponent.avatar}
            status={opponent.status}
            username={opponent.username}
            key={opponent.id}
            cards={opponent.cards}
            stackOpenDeckCards={opponent.stackOpenDeck.cards}
          />
        ))}
      </GameGrid>
      <GameSettingsModal isOpen={gameStatus === GameStatus.New || gameStatus === GameStatus.Pause || gameStatus === GameStatus.RoundFinished} />
    </>
  )
}
