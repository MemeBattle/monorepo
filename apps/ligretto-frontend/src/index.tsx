import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { ThemeProvider, CssBaseline } from '@memebattle/ui'
import { HistoryRouter as Router } from 'redux-first-history/rr6'
import { store, history } from './app/store'

import { theme } from './app/themes/default'
import { AppContainer } from './app/AppContainer'

const reactRootContainer = document.getElementById('root')

if (!reactRootContainer) {
  throw new Error('Element #root does not found')
}

const root = createRoot(reactRootContainer)

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
