import { createSelector } from '@reduxjs/toolkit'

import { gameStatusSelector, isGameLoadedSelector, isPlayerSpectatorSelector, startingDelayInSecSelector } from 'ducks/game'

export const gamePageContainerSelector = createSelector(
  [gameStatusSelector, isGameLoadedSelector, isPlayerSpectatorSelector, startingDelayInSecSelector],
  (gameStatus, isGameLoaded, isPlayerSpectator, startingDelayInSec) => ({
    gameStatus,
    isGameLoaded,
    isPlayerSpectator,
    startingDelayInSec,
  }),
)
