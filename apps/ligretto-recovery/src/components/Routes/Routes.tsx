import React from 'react'
import { Switch, Route } from 'react-router-dom'

import { GamePage, HomePage } from 'pages'
import { routes } from 'utils/constants'

const Router = () => (
  <Switch>
    <Route path={routes.HOME_ROUTE} component={HomePage} exact />
    <Route path={routes.GAME_ROUTE} component={GamePage} exact />
  </Switch>
)

export default Router
