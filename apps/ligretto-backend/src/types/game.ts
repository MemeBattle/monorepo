import { Playground } from './playground'
import { CardColors } from './card'
import { Player } from './player'


export interface Game {
  players: {
    [color in CardColors]: Player
  },
  playground: Playground,
}
