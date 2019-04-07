import { createBrowserHistory } from 'history'
import { syncHistoryWithStore } from 'mobx-react-router'
import authStore from './auth'
import routingStore from './routing'

const browserHistory = createBrowserHistory()

const stores = {
  routing: routingStore,
  auth: authStore,
}

export const history = syncHistoryWithStore(browserHistory, routingStore)

export default stores
