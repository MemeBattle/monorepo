import { injectable, inject } from 'inversify'
import { autorun } from 'mobx'
import { TYPES } from '../types'
import { storage } from '../database/database'
import { WebSocketHandler } from './handler'

export interface Emitter {
  init(): void
}

@injectable()
export class Emitter implements Emitter {
  @inject(TYPES.WebSocketHandler) private webSocketHandler: WebSocketHandler

  init(): void {
    autorun(() => {
      console.log(storage.games)
    })
  }
}
