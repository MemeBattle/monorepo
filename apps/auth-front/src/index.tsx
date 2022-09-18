import React from 'react'
import ReactDOM from 'react-dom'
import { App } from './App'

import { CssBaseline } from '@memebattle/ui'

const rootNode = document.getElementById('root')

const AppJSX = (
  <React.StrictMode>
    <CssBaseline />
    <App onLoginSucceeded={() => {}} />
  </React.StrictMode>
)

if (rootNode?.hasChildNodes()) {
  ReactDOM.hydrate(AppJSX, rootNode)
} else {
  ReactDOM.render(AppJSX, rootNode)
}
