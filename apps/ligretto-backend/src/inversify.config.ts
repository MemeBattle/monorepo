import 'reflect-metadata'
import { Container } from 'inversify'
import { TYPES } from './types'
import { GameService } from './entities/game/game.service'
import { GameplayController } from './controllers/gameplay-controller'

const IOC = new Container()
IOC.bind<GameService>(TYPES.GameService).to(GameService)
IOC.bind<GameplayController>(TYPES.GameController).to(GameController)
