import 'reflect-metadata'
import { Container } from 'inversify'
import { IOC_TYPES } from './IOC_TYPES'
import { GameService } from './entities/game/game.service'
import { GameplayController } from './controllers/gameplay-controller'
import { GamesController } from './controllers/games-controller'
import { Gameplay } from './gameplay/gameplay'
import { WebSocketHandler } from './websocket-handlers'
import { GameRepository } from './entities/game/game.repo'
import { PlaygroundRepository, PlaygroundService } from './entities/playground'
import { PlayerRepository } from './entities/player/player.repo'
import { PlayerService } from './entities/player/player.service'
import { Database } from './database'
import { UserService, UserRepository } from './entities/user'
import { BotController } from './controllers/bot-controller'
import { AuthService } from './services/auth'
import { LigrettoCoreService } from './services/ligretto-core'

export const createIOC = () => {
  const IOC = new Container()

  IOC.bind<WebSocketHandler>(IOC_TYPES.IWebSocketHandler).to(WebSocketHandler)
  IOC.bind<GameService>(IOC_TYPES.IGameService).to(GameService)
  IOC.bind<GameRepository>(IOC_TYPES.IGameRepository).to(GameRepository)
  IOC.bind<PlaygroundRepository>(IOC_TYPES.IPlaygroundRepository).to(PlaygroundRepository)
  IOC.bind<PlaygroundService>(IOC_TYPES.IPlaygroundService).to(PlaygroundService)
  IOC.bind<PlayerRepository>(IOC_TYPES.IPlayerRepository).to(PlayerRepository)
  IOC.bind<PlayerService>(IOC_TYPES.IPlayerService).to(PlayerService)
  IOC.bind<UserService>(IOC_TYPES.IUserService).to(UserService)
  IOC.bind<UserRepository>(IOC_TYPES.IUserRepository).to(UserRepository)
  IOC.bind<Gameplay>(IOC_TYPES.IGameplay).to(Gameplay)
  IOC.bind<GameplayController>(IOC_TYPES.GameplayController).to(GameplayController)
  IOC.bind<GamesController>(IOC_TYPES.GamesController).to(GamesController)
  IOC.bind<BotController>(IOC_TYPES.BotController).to(BotController)
  IOC.bind<Database>(IOC_TYPES.Database).to(Database).inSingletonScope()
  IOC.bind<AuthService>(IOC_TYPES.IAuthService).to(AuthService).inSingletonScope()
  IOC.bind<LigrettoCoreService>(IOC_TYPES.ILigrettoCoreService).to(LigrettoCoreService).inSingletonScope()

  return IOC
}

export const IOC = createIOC()
