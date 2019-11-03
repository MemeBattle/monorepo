import { Playground } from './playground'
import { Player } from './player'

export interface Game {
  players: {
    [player: string]: Player
  }
  playground: Playground
  config: {
    cardsCount: number
  }
}
