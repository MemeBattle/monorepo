import { GameGrid } from './GameGrid'
import { Opponent, CardsPanelContainer } from 'features/player'
import { PlaygroundContainer } from 'features/playground'
import { createSelector } from '@reduxjs/toolkit'
import { useSelector } from 'react-redux'
import { gameStatusSelector, isPlayerSpectatorSelector, opponentsSelector, startingDelayInSecSelector } from 'ducks/game'
import { GameStatus } from '@memebattle/ligretto-shared'
import { ScreenCountdown } from './ScreenCountdown'

const gamePageContainerSelector = createSelector(
  [gameStatusSelector, isPlayerSpectatorSelector, startingDelayInSecSelector, opponentsSelector],
  (gameStatus, isPlayerSpectator, startingDelayInSec, opponents) => ({
    gameStatus,
    isPlayerSpectator,
    startingDelayInSec,
    opponents,
  }),
)

export const GameContainer = () => {
  const { isPlayerSpectator, opponents, startingDelayInSec, gameStatus } = useSelector(gamePageContainerSelector)

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
    </>
  )
}
