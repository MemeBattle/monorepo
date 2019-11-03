import { get, set } from 'lodash'
import { Storage } from './storage'

const storage: Storage = {
  games: {},
  users: {},
}

type Accessor<T> = (storage: Storage) => T
type Setter = (storage: Storage) => void

export const database = {
  get<T>(accessor: Accessor<T>) {
    return Promise.resolve(accessor(storage))
  },
  set(setter: Setter) {
    return Promise.resolve(setter(storage))
  },
};
