import '#app/sentry/initSentry'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { ThemeProvider, CssBaseline } from '@memebattle/ui'
import { HistoryRouter as Router } from 'redux-first-history/rr6'
import { store, history } from './app/store'

import { getMeRequest } from '#ducks/auth'
import { LOCAL_STORAGE_TOKEN_KEY } from '#ducks/auth/constants'
import { theme } from './app/themes/default'
import { AppContainer } from './app/AppContainer'

const reactRootContainer = document.getElementById('root')

if (!reactRootContainer) {
  throw new Error('Element #root does not found')
}

const root = createRoot(reactRootContainer)

// A single explicit auth bootstrap. Doing this with a fire-on-any-action
// listener is unsafe: nested dispatch cascades (e.g. the connect-to-room chain
// on a direct /game/:id load) run it once per snapshotted dispatch, minting
// several temporary users at once.
store.dispatch(getMeRequest({ token: window.localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY) ?? undefined }))

root.render(
  <StrictMode>
    <Provider store={store}>
      <Router history={history}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <AppContainer />
        </ThemeProvider>
      </Router>
    </Provider>
  </StrictMode>,
)
