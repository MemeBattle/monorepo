import React from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { ThemeProvider, CssBaseline } from '@memebattle/ui'
import { HistoryRouter as Router } from 'redux-first-history/rr6'
import { theme } from './themes/default'

import { store, history } from 'store'
import { AppContainer } from 'containers/app'

const reactRootContainer = document.getElementById('root')

if (!reactRootContainer) {
  throw new Error('Element #root does not found')
}

const root = createRoot(reactRootContainer)

root.render(
  <Provider store={store}>
    <Router history={history}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AppContainer />
      </ThemeProvider>
    </Router>
  </Provider>,
)
