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
import { GameplayOutput } from './gameplay/gameplay-output'
import { UserService, UserRepository } from './entities/user'
import { TechController } from './controllers/tech-controller'
import { AuthService } from './entities/auth'

export const IOC = new Container()

IOC.bind<WebSocketHandler>(IOC_TYPES.WebSocketHandler).to(WebSocketHandler)
IOC.bind<GameService>(IOC_TYPES.GameService).to(GameService)
IOC.bind<GameRepository>(IOC_TYPES.GameRepository).to(GameRepository)
IOC.bind<PlaygroundRepository>(IOC_TYPES.PlaygroundRepository).to(PlaygroundRepository)
IOC.bind<PlaygroundService>(IOC_TYPES.PlaygroundService).to(PlaygroundService)
IOC.bind<PlayerRepository>(IOC_TYPES.PlayerRepository).to(PlayerRepository)
IOC.bind<PlayerService>(IOC_TYPES.PlayerService).to(PlayerService)
IOC.bind<UserService>(IOC_TYPES.UserService).to(UserService)
IOC.bind<UserRepository>(IOC_TYPES.UserRepository).to(UserRepository)
IOC.bind<Gameplay>(IOC_TYPES.Gameplay).to(Gameplay)
IOC.bind<GameplayController>(IOC_TYPES.GameplayController).to(GameplayController)
IOC.bind<GameplayOutput>(IOC_TYPES.GameplayOutput).to(GameplayOutput)
IOC.bind<GamesController>(IOC_TYPES.GamesController).to(GamesController)
IOC.bind<TechController>(IOC_TYPES.TechController).to(TechController)
IOC.bind<Database>(IOC_TYPES.Database).to(Database).inSingletonScope()
IOC.bind<AuthService>(IOC_TYPES.AuthService).to(AuthService).inSingletonScope()
