import { injectable } from 'inversify'
import axios from 'axios'
import type { AxiosResponse } from 'axios'
import type { Game, RoundInfo, CreateGameRequest, CreateGameResponse, SaveRoundRequest, SaveRoundResponse } from '@memebattle/ligretto-shared'
import { LIGRETTO_CORE_URL } from '../../config'

export interface ILigrettoCoreService {
  createGameService(): Promise<CreateGameResponse>
  saveGameRoundService(gameId: Game['id'], round: RoundInfo): Promise<SaveRoundResponse>
}

@injectable()
export class LigrettoCoreService implements ILigrettoCoreService {
  private request = axios.create({
    baseURL: LIGRETTO_CORE_URL,
  })

  public async createGameService() {
    const res = await this.request.post<CreateGameResponse, AxiosResponse<CreateGameResponse>, CreateGameRequest>('/games')

    return res.data
  }

  public async saveGameRoundService(gameId: Game['id'], round: RoundInfo) {
    const res = await this.request.post<SaveRoundResponse, AxiosResponse<SaveRoundResponse>, SaveRoundRequest>(`/games/${gameId}/rounds`, {
      results: Object.entries(round.results).map(([playerId, { roundScore }]) => ({
        playerId,
        score: roundScore,
      })),
    })

    return res.data
  }
}
