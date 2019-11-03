import { injectable, inject } from 'inversify'
import { GameService } from '../entities/game/game.service'
import { TYPES } from '../types'

export interface GameplayController {
  initGame(): void
}

@injectable()
export class GameplayController implements GameplayController {
  @inject(TYPES.GameService) private gameService: GameService
}
