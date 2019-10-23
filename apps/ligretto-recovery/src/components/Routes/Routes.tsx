import React from 'react'
import { Switch, Route } from 'react-router-dom'

import { GamePage, HomePage } from 'pages'

const Router = () => (
  <Switch>
    <Route path="/" component={HomePage} exact />
    <Route path="/game" component={GamePage} exact />
  </Switch>
)

export default Router
