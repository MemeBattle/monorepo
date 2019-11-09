import 'reflect-metadata'
import { Container } from 'inversify'
import { TYPES } from './types'
import { GameService } from './entities/game/game.service'
import { GameController } from './controllers/game-controller'
import { Gameplay } from './gameplay/gameplay'

const IOC = new Container()
IOC.bind<GameService>(TYPES.GameService).to(GameService)
IOC.bind<GameController>(TYPES.GameController).to(GameController)
IOC.bind(TYPES.Gameplay).to(Gameplay)
