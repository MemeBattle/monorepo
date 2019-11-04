import React from 'react'
import { Switch, Route } from 'react-router-dom'

import { GamePage, HomePage, RoomsPage } from 'pages'

const Router = () => (
  <Switch>
    <Route path="/" component={HomePage} exact />
    <Route path="/game" component={GamePage} exact />
    <Route path="/rooms" component={RoomsPage} exact />
  </Switch>
)

export default Router
