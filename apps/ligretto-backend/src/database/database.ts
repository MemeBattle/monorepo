import { Storage } from './storage'
import { observable } from 'mobx'

export const storage: Storage = observable({
  games: {},
  users: {},
})

type Accessor<T> = (storage: Storage) => T
type Setter = (storage: Storage) => void

export const database = {
  get<T>(accessor: Accessor<T>) {
    return Promise.resolve(accessor(storage))
  },
  set(setter: Setter) {
    return Promise.resolve(setter(storage))
  },
}
