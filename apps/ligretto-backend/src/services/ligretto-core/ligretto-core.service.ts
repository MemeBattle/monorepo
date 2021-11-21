import { injectable } from 'inversify'
import { LIGRETTO_CORE_URL } from '../../config'
import axios from 'axios'
import type { Game, GameResults, RoundInfo } from '@memebattle/ligretto-shared'

@injectable()
export class LigrettoCoreService {
  private request = axios.create({
    baseURL: LIGRETTO_CORE_URL,
  })

  public async createGameService(game: Pick<Game, 'name' | 'config'>) {
    const res = await this.request.post<Pick<Game, 'id' | 'name' | 'config'>>('/games', game)

    return res.data
  }

  public async saveGameRoundService(gameId: Game['id'], round: RoundInfo) {
    const res = await this.request.post<GameResults>(`/games/${gameId}/rounds`, { round })

    return res.data
  }
}
