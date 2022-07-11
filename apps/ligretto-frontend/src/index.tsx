import React from 'react'
import ReactDOM from 'react-dom'
import { Provider } from 'react-redux'
import { ConnectedRouter } from 'connected-react-router'
import { ThemeProvider, theme, CssBaseline } from '@memebattle/ui'

import { store, history } from 'store'
import { AppContainer } from 'containers/app'

ReactDOM.render(
  <Provider store={store}>
    <ConnectedRouter history={history}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AppContainer />
      </ThemeProvider>
    </ConnectedRouter>
  </Provider>,
  document.getElementById('root'),
)
