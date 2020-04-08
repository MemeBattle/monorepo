import { RoomsState } from '../ducks/rooms/reducer'
import { GameState } from '../ducks/game/reducer'
import { UserState } from '../ducks/user/reducer'
import { CardsState } from '../ducks/cards/reducer'
import { RouterState } from 'connected-react-router'

export interface All {
  user: UserState
  cards: CardsState
  rooms: RoomsState
  router: RouterState
  game: GameState
}
