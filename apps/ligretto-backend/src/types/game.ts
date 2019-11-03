import { Playground } from './playground'
import { CardColors } from './card'
import { Player } from './player'

export interface Game {
  players: {
    [color: string]: Player
  }
  playground: Playground,
  config: {
    cardsCount: number
  }
}
