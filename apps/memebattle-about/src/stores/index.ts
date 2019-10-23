/* eslint-disable @typescript-eslint/no-empty-interface */
import { applySnapshot, Instance, SnapshotIn, SnapshotOut, types } from 'mobx-state-tree'
import { useStaticRendering } from 'mobx-react-lite'
import { TeamStore } from './TeamStore'
import { ProjectsStore } from './ProjectsStore'

let store: Store = null as any

const Store = types.model({
  team: types.optional(TeamStore, { teammates: [] }),
  projects: types.optional(ProjectsStore, { projects: [] }),
})

export interface Store extends Instance<typeof Store> {}
export interface StoreSnapshotIn extends SnapshotIn<typeof Store> {}
export interface StoreSnapshotOut extends SnapshotOut<typeof Store> {}

export const initializeStore = (snapshot = null) => {
  if (typeof window === 'undefined') {
    store = Store.create()
    useStaticRendering(true)
  }
  if (store === null) {
    store = Store.create()
  }
  if (snapshot) {
    applySnapshot(store, snapshot)
  }
  return store
}
