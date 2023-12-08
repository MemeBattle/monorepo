import { AdonisSchema } from './AdonisSchema'
import { Game } from './Game'
import { Round } from './Round'
import { RoundUser } from './RoundUser'
import { User } from './User'
  
interface EntityTypes  {
  AdonisSchema: AdonisSchema
    Game: Game
    Round: Round
    RoundUser: RoundUser
    User: User
}
  
export { EntityTypes, AdonisSchema, Game, Round, RoundUser, User }