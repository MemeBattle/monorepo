import { createSelector } from 'reselect'

import { gameStatusSelector, isGameLoadedSelector, isPlayerSpectatorSelector } from 'ducks/game'

export const gamePageContainerSelector = createSelector(
  [gameStatusSelector, isGameLoadedSelector, isPlayerSpectatorSelector],
  (gameStatus, isGameLoaded, isPlayerSpectator) => ({
    gameStatus,
    isGameLoaded,
    isPlayerSpectator,
  }),
)
