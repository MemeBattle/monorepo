import { injectable } from 'inversify'

export interface GameService {
  initGame(): void
}

@injectable()
export class GameService implements GameService {
  public initGame() {
    console.log('initGame')
  }
}
