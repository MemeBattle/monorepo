import { createSelector } from 'reselect'
import { Player } from '@memebattle/ligretto-shared'
import { All } from '../../types/store'
import { playersSortByColor } from 'utils'

export const selectPlayerColor = (state: All) => state.game.playerColor
export const selectGameId = (state: All) => state.game.id
export const selectGameStatus = (state: All) => state.game.status
export const selectPlayers = (state: All) => state.game.players
export const selectPlayer = (state: All) => selectPlayers(state)[selectPlayerColor(state)]
export const selectPlayerStatus = (state: All) => selectPlayer(state).status
export const selectIsGameLoaded = (state: All) => state.game.isGameLoaded

export const selectOpponents = createSelector([selectPlayers, selectPlayerColor], (players, playerColor) =>
  playersSortByColor(
    Object.values(players).reduce<Player[]>(
      (opponents, gamePlayer) => (gamePlayer.color === playerColor ? opponents : [...opponents, gamePlayer]),
      [],
    ),
  ),
)
