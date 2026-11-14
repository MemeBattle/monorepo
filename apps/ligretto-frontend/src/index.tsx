import '#app/sentry/initSentry'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { ThemeProvider, CssBaseline } from '@memebattle/ui'
import { HistoryRouter as Router } from 'redux-first-history/rr6'
import { QueryClientProvider } from '@tanstack/react-query'
import { store, history } from './app/store'

import { getMeRequest } from '#ducks/auth'
import { createQueryClient } from '#shared/api'
import { theme } from './app/themes/default'
import { AppContainer } from './app/AppContainer'

const reactRootContainer = document.getElementById('root')

if (!reactRootContainer) {
  throw new Error('Element #root does not found')
}

const root = createRoot(reactRootContainer)

const queryClient = createQueryClient()

// Bootstrap once; nested dispatches can trigger an action-based bootstrap multiple times.
store.dispatch(getMeRequest())

root.render(
  <StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <Router history={history}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <AppContainer />
          </ThemeProvider>
        </Router>
      </QueryClientProvider>
    </Provider>
  </StrictMode>,
)
