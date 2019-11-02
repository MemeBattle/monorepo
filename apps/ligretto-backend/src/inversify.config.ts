import 'reflect-metadata'
import { Container } from 'inversify'
import { TYPES } from './types'
import { GameService } from './entities/game/game.service'
import { GameController } from './controllers/gameController'

const IOC = new Container()
IOC.bind<GameService>(TYPES.GameService).to(GameService)
IOC.bind<GameController>(TYPES.GameController).to(GameController)
