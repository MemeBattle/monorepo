import type { RoomsState } from '../ducks/rooms/reducer'
import type { GameState } from '../ducks/game/slice'
import type { CardsState } from '../ducks/cards/reducer'
import type { TechState } from '../ducks/tech/slice'
import type { RouterState } from 'connected-react-router'

export interface All {
  cards: CardsState
  rooms: RoomsState
  router: RouterState
  game: GameState
  tech: TechState
}
