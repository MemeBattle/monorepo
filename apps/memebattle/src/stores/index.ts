/* eslint-disable @typescript-eslint/no-empty-interface */
import { createBrowserHistory } from 'history'
import { syncHistoryWithStore } from 'mst-react-router'
import { types, Instance } from 'mobx-state-tree'
import AuthStore from './auth'
import RoutingStore from './routing'
import UserStore from './user'

const browserHistory = createBrowserHistory()

const Store = types.model({
  auth: AuthStore,
  routing: RoutingStore,
  user: UserStore,
})

const routingStore = RoutingStore.create()

export const history = syncHistoryWithStore(browserHistory, routingStore)

export interface Store extends Instance<typeof Store> {}

export default Store.create({
  routing: routingStore,
})
