import { createSelector } from 'reselect'
import omit from 'lodash/omit'
import { Player } from '@memebattle/ligretto-shared'
import { All } from '../../types/store'

export const selectPlayerId = (state: All) => state.game.playerId
export const selectGameId = (state: All) => state.game.id
export const selectGameStatus = (state: All) => state.game.status
export const selectPlayers = (state: All) => state.game.players
export const selectIsGameLoaded = (state: All) => state.game.isGameLoaded
export const selectGameResults = (state: All) => state.game.results
export const selectPlayer = (state: All): Player | undefined => selectPlayers(state)[selectPlayerId(state)]

export const selectPlayerStatus = (state: All) => selectPlayer(state)?.status
export const selectOpponents = createSelector([selectPlayers, selectPlayerId], (players, playerId) => Object.values(omit(players, playerId)))
