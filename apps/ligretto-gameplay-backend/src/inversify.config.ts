import 'reflect-metadata'
import { Container } from 'inversify'
import { IOC_TYPES } from './IOC_TYPES'
import { GameService } from './entities/game/game.service'
import type { IGameService } from './entities/game/game.service'
import { GameplayController } from './controllers/gameplay-controller'
import { GamesController } from './controllers/games-controller'
import type { IGamesController } from './controllers/games-controller'
import type { IController } from './controllers/controller'
import { Gameplay } from './gameplay/gameplay'
import type { IGameplay } from './gameplay/gameplay'
import { WebSocketHandler } from './websocket-handlers'
import type { IWebSocketHandler } from './websocket-handlers'
import { GameRepository } from './entities/game/game.repo'
import type { IGameRepository } from './entities/game/game.repo'
import { PlaygroundRepository, PlaygroundService } from './entities/playground'
import type { IPlaygroundRepository, IPlaygroundService } from './entities/playground'
import { PlayerRepository } from './entities/player/player.repo'
import { PlayerService } from './entities/player/player.service'
import type { IPlayerRepository } from './entities/player/player.repo'
import type { IPlayerService } from './entities/player/player.service'
import { Database } from './database'
import { UserService, UserRepository } from './entities/user'
import type { IUserService, IUserRepository } from './entities/user'
import { BotController } from './controllers/bot-controller'
import { AuthService } from './services/auth'
import { LigrettoCoreService } from './services/ligretto-core'
import type { IAuthService } from './services/auth'
import type { ILigrettoCoreService } from './services/ligretto-core'

export const createIOC = () => {
  const IOC = new Container()

  IOC.bind<IWebSocketHandler>(IOC_TYPES.IWebSocketHandler).to(WebSocketHandler)
  IOC.bind<IGameService>(IOC_TYPES.IGameService).to(GameService)
  IOC.bind<IGameRepository>(IOC_TYPES.IGameRepository).to(GameRepository)
  IOC.bind<IPlaygroundRepository>(IOC_TYPES.IPlaygroundRepository).to(PlaygroundRepository)
  IOC.bind<IPlaygroundService>(IOC_TYPES.IPlaygroundService).to(PlaygroundService)
  IOC.bind<IPlayerRepository>(IOC_TYPES.IPlayerRepository).to(PlayerRepository)
  IOC.bind<IPlayerService>(IOC_TYPES.IPlayerService).to(PlayerService)
  IOC.bind<IUserService>(IOC_TYPES.IUserService).to(UserService)
  IOC.bind<IUserRepository>(IOC_TYPES.IUserRepository).to(UserRepository)
  IOC.bind<IGameplay>(IOC_TYPES.IGameplay).to(Gameplay)
  IOC.bind<IController>(IOC_TYPES.IController).to(GameplayController).whenTargetNamed('gameplayController')
  IOC.bind<IGamesController>(IOC_TYPES.IGamesController).to(GamesController)
  IOC.bind<IController>(IOC_TYPES.IController).to(BotController).whenTargetNamed('botController')
  IOC.bind<Database>(IOC_TYPES.Database).to(Database).inSingletonScope()
  IOC.bind<IAuthService>(IOC_TYPES.IAuthService).to(AuthService).inSingletonScope()
  IOC.bind<ILigrettoCoreService>(IOC_TYPES.ILigrettoCoreService).to(LigrettoCoreService).inSingletonScope()

  return IOC
}

export const IOC = createIOC()
