import { Playground } from './playground'
import { Player } from './player'

export interface Game {
  id: string
  name: string
  players: {
    [player: string]: Player
  }
  playground: Playground
  config: {
    cardsCount: number
    playersMaxCount: number
  }
}
