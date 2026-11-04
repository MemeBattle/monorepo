import type { AnyAction } from './actions'

/** One client's open connection, whatever carries it. */
export interface Connection {
  send(action: AnyAction): void
  close(code: number, reason: string): void
}

export interface RoundToSave {
  roundId: string
  results: Array<{ playerId: string; score: number }>
}
