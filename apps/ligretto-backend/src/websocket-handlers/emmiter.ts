import { injectable, inject } from 'inversify'
import { autorun } from 'mobx'
import { TYPES } from '../types'
import { storage } from '../database/database'
import { WebSocketHandler } from './handler'

export interface Emmiter {
  init(): void
}

@injectable()
export class Emmiter implements Emmiter {
  @inject(TYPES.WebSocketHandler) private webSocketHandler: WebSocketHandler

  init(): void {
    autorun(() => {
      console.log(storage.games)
    })
  }
}
