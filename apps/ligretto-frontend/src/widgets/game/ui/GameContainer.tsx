import { GameGrid } from './GameGrid'
import { Opponent, CardsPanelContainer } from '#features/player'
import { PlaygroundContainer } from '#features/playground'
import { createSelector } from '@reduxjs/toolkit'
import { useSelector } from 'react-redux'
import { gameStatusSelector, isDndEnabledSelector, isPlayerSpectatorSelector, opponentsSelector, startingDelayInSecSelector } from '#ducks/game'
import { GameStatus } from '@memebattle/ligretto-shared'
import { ScreenCountdown } from './ScreenCountdown'
import { CardFocusProvider } from '#features/cardFocus'

const gamePageContainerSelector = createSelector(
  [gameStatusSelector, isDndEnabledSelector, isPlayerSpectatorSelector, startingDelayInSecSelector, opponentsSelector],
  (gameStatus, isDndEnabled, isPlayerSpectator, startingDelayInSec, opponents) => ({
    gameStatus,
    isDndEnabled,
    isPlayerSpectator,
    startingDelayInSec,
    opponents,
  }),
)

export const GameContainer = () => {
  const { isDndEnabled, isPlayerSpectator, opponents, startingDelayInSec, gameStatus } = useSelector(gamePageContainerSelector)

  return (
    <CardFocusProvider enabled={isDndEnabled && !isPlayerSpectator && gameStatus === GameStatus.InGame}>
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
    </CardFocusProvider>
  )
}
