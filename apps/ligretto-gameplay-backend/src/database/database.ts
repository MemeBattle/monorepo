import { injectable } from 'inversify'
import type { Storage } from './storage'

type Accessor<T> = (storage: Storage) => T
type Setter<T = void> = (storage: Storage) => T

export interface Database {
  get<T>(accessor: Accessor<T>): T
  set<T>(setter: Setter<T>): T
}

@injectable()
export class Database implements Database {
  private storage: Storage = {
    games: {},
    users: {},
    roundResults: {},
  }

  public get<T>(accessor: Accessor<T>): T {
    return accessor(this.storage)
  }

  public set<S>(setter: Setter<S>): S {
    return setter(this.storage)
  }
}
