import { get, set } from 'lodash'
import { Storage } from './storage'

const storage: Storage = {
  games: {},
  users: {},
}

type Accessor<T = undefined> = (storage: Storage) => ReturnType<T>
type Setter = (storage: Storage) => void

export const database = {
  get(accessor: Accessor): ReturnType<Accessor> {
    return Promise.resolve(() => accessor(storage))
  },
  set(setter: Setter) {
    return Promise.resolve(() => setter(storage));
  },
};
