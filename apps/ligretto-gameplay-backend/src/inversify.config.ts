import 'reflect-metadata'
import { Container } from 'inversify'
import { createClient, type Client } from '@memebattle/ligretto-core-client/internal'
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
import { LigrettoCoreService } from './services/ligretto-core'
import { GameConnectionService } from './services/game-connection/game-connection.service'
import { LIGRETTO_CORE_URL, LIGRETTO_INTERNAL_API_TOKEN } from './config'

export const createIOC = () => {
  const IOC = new Container()

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
  IOC.bind<GamesController>(IOC_TYPES.GamesController).to(GamesController)
  IOC.bind<BotController>(IOC_TYPES.BotController).to(BotController)
  IOC.bind<Database>(IOC_TYPES.Database).to(Database).inSingletonScope()
  IOC.bind<LigrettoCoreService>(IOC_TYPES.LigrettoCoreService).to(LigrettoCoreService).inSingletonScope()
  // Built on first use, so a container whose LigrettoCoreService is a stub never makes it.
  IOC.bind<Client>(IOC_TYPES.LigrettoCoreClient)
    .toDynamicValue(() => createClient({ baseUrl: LIGRETTO_CORE_URL ?? '', headers: { authorization: `Bearer ${LIGRETTO_INTERNAL_API_TOKEN}` } }))
    .inSingletonScope()
  IOC.bind<GameConnectionService>(IOC_TYPES.GameConnectionService).to(GameConnectionService).inSingletonScope()

  return IOC
}

export const IOC = createIOC()
