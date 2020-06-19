import 'reflect-metadata'
import { Container } from 'inversify'
import { TYPES } from './types'
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
import { GameplayOutput } from './gameplay/gameplay-output'
import { UserService, UserRepository } from './entities/user'
import { TechController } from './controllers/tech-controller'

export const IOC = new Container()

IOC.bind<WebSocketHandler>(TYPES.WebSocketHandler).to(WebSocketHandler)
IOC.bind<GameService>(TYPES.GameService).to(GameService)
IOC.bind<GameRepository>(TYPES.GameRepository).to(GameRepository)
IOC.bind<PlaygroundRepository>(TYPES.PlaygroundRepository).to(PlaygroundRepository)
IOC.bind<PlaygroundService>(TYPES.PlaygroundService).to(PlaygroundService)
IOC.bind<PlayerRepository>(TYPES.PlayerRepository).to(PlayerRepository)
IOC.bind<PlayerService>(TYPES.PlayerService).to(PlayerService)
IOC.bind<UserService>(TYPES.UserService).to(UserService)
IOC.bind<UserRepository>(TYPES.UserRepository).to(UserRepository)
IOC.bind<Gameplay>(TYPES.Gameplay).to(Gameplay)
IOC.bind<GameplayController>(TYPES.GameplayController).to(GameplayController)
IOC.bind<GameplayOutput>(TYPES.GameplayOutput).to(GameplayOutput)
IOC.bind<GamesController>(TYPES.GamesController).to(GamesController)
IOC.bind<TechController>(TYPES.TechController).to(TechController)
IOC.bind<Database>(TYPES.Database)
  .to(Database)
  .inSingletonScope()
