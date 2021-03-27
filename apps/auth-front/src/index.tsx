import React from 'react'
import ReactDOM from 'react-dom'
import { App } from './App'
import reportWebVitals from './reportWebVitals'

import { ThemeProvider, theme, CssBaseline } from '@memebattle/ligretto-ui'

const rootNode = document.getElementById('root')

console.log(process.env)
console.log(process.env.REACT_APP_WEBSOCKET_HOST)

const AppJSX = (
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
)

if (rootNode?.hasChildNodes()) {
  ReactDOM.hydrate(AppJSX, rootNode)
} else {
  ReactDOM.render(AppJSX, rootNode)
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals(console.log)
