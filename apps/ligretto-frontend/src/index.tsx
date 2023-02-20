import React from 'react'
import ReactDOM from 'react-dom'
import { Provider } from 'react-redux'
import { ThemeProvider, CssBaseline } from '@memebattle/ui'
import { HistoryRouter as Router } from 'redux-first-history/rr6'
import { theme } from './themes/default'

import { store, history } from 'store'
import { AppContainer } from 'containers/app'

ReactDOM.render(
  <Provider store={store}>
    <Router history={history}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AppContainer />
      </ThemeProvider>
    </Router>
  </Provider>,
  document.getElementById('root'),
)
