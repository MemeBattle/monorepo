import type { RoomsState } from '../ducks/rooms/reducer'
import type { GameState } from '../ducks/game/reducer'
import type { CardsState } from '../ducks/cards/reducer'
import type { TechState } from '../ducks/tech/reducer'
import type { RouterState } from 'connected-react-router'

export interface All {
  cards: CardsState
  rooms: RoomsState
  router: RouterState
  game: GameState
  tech: TechState
}
