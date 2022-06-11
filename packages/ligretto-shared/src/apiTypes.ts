import type { Game, GameResults, Player } from './types'

export type CreateGameRequest = undefined
export type CreateGameResponse = Pick<Game, 'id'>

export interface SaveRoundRequest {
  results: Array<{ playerId: Player['id']; score: number }>
}

export interface SaveRoundResponse {
  gameResults: GameResults
}
