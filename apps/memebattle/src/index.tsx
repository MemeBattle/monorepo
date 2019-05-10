import React from 'react'
import ReactDOM from 'react-dom'
import 'assets/styles/_index.scss'
import * as serviceWorker from './serviceWorker'
import { Router } from 'react-router'
import { AppComponent } from './components/app'
import { StoreContext } from './contexts'
import stores, { history } from 'stores'

ReactDOM.render(
  <StoreContext.Provider value={stores}>
    <Router history={history}>
      <AppComponent />
    </Router>
  </StoreContext.Provider>,
  document.getElementById('root'),
)

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: http://bit.ly/CRA-PWA
serviceWorker.unregister()
