import { createRoomEmitAction } from '@memebattle/ligretto-shared'

import type { GamesController } from '../games-controller'

import { IOC } from '../../inversify.config'
import { IOC_TYPES } from '../../IOC_TYPES'
import type { Database } from '../../database'
import { socketMockImpl } from '../../../test/utils'
import type { AnyAction } from '../../types/any-action'

describe('Games Controller', () => {
  it('should be defined', () => {
    const controller: GamesController = IOC.get(IOC_TYPES.GamesController)

    expect(controller).toBeDefined()
  })

  it('should create relevant state on create game', done => {
    const createGameService = jest.fn().mockReturnValue({ id: '1' })

    IOC.rebind(IOC_TYPES.LigrettoCoreService).toConstantValue({ createGameService })
    const controller: GamesController = IOC.get(IOC_TYPES.GamesController)
    const database: Database = IOC.get(IOC_TYPES.Database)

    const createGameAction = createRoomEmitAction({ name: 'createGame', config: {} }) as AnyAction

    const handleMessagePromise = controller.handleMessage(socketMockImpl, createGameAction) as unknown as Promise<void>

    handleMessagePromise.then(() => {
      database.get(db => {
        expect(db).toMatchSnapshot()

        done()
      })
    })
  })
})
