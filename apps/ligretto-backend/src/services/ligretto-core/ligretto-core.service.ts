import { injectable } from 'inversify'
import { LIGRETTO_CORE_URL } from '../../config'
import axios from 'axios'
import type { Game, GameResults, RoundInfo } from '@memebattle/ligretto-shared'

@injectable()
export class LigrettoCoreService {
  private request = axios.create({
    baseURL: LIGRETTO_CORE_URL,
  })

  public async saveGameRoundService(gameId: Game['id'], round: RoundInfo) {
    const res = await this.request.post<GameResults>(`/game/${gameId}/round`, { round })

    return res.data
  }
}
