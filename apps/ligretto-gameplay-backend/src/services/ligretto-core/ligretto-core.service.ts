import { injectable } from 'inversify'
import type { Game, RoundInfo, CreateGameResponse, SaveRoundResponse } from '@memebattle/ligretto-shared'
import { LIGRETTO_CORE_URL } from '../../config'

async function post<T>(path: string, body?: unknown): Promise<{ data: T }> {
  const response = await fetch(`${LIGRETTO_CORE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = (await response.json()) as T
  return { data }
}

@injectable()
export class LigrettoCoreService {
  public async createGameService() {
    const res = await post<CreateGameResponse>('/games')
    return res.data
  }

  public async saveGameRoundService(gameId: Game['id'], round: RoundInfo) {
    const res = await post<SaveRoundResponse>(`/games/${gameId}/rounds`, {
      results: Object.entries(round.results).map(([playerId, { roundScore }]) => ({
        playerId,
        score: roundScore,
      })),
    })
    return res.data
  }
}
