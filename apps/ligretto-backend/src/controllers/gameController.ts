import { injectable, inject } from 'inversify'
import { GameService } from '../entities/game/game.service'
import { TYPES } from '../types'

export interface GameController {
  initGame(): void
}

@injectable()
export class GameController implements GameController {
  @inject(TYPES.GameService) private gameService: GameService

  initGame() {
    this.gameService.initGame()
  }
}
