import type { Game, GameResults, RoundInfo } from './types'

export type CreateGameRequest = undefined
export type CreateGameResponse = Pick<Game, 'id'>

export interface SaveRoundRequest {
  round: RoundInfo
}

export interface SaveRoundResponse {
  gameResults: GameResults
}
