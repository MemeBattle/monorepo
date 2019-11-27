import { injectable } from 'inversify'
import { Storage } from './storage'

export const storage: Storage = {
  games: {},
  users: {},
}

type Accessor<T> = (storage: Storage) => T
type Setter<T = void> = (storage: Storage) => T

export interface Database {
  get<T>(accessor: Accessor<T>): Promise<T>
  set<T>(setter: Setter<T>): Promise<T>
  storage: Storage
}

@injectable()
export class Database implements Database {
  constructor() {
    this.storage = {
      games: {},
      users: {},
    }
  }

  public get<T>(accessor: Accessor<T>) {
    return Promise.resolve(accessor(this.storage))
  }

  public set(setter: Setter) {
    return Promise.resolve(setter(this.storage))
  }
}
