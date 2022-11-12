import React from 'react'
import { Switch, Route } from 'react-router-dom'

import { GamePage, HomePage, TechPage, RoomsManagerPage } from 'pages'
import { AuthContainer } from 'containers/AuthContainer'
import { routes } from 'utils/constants'

export const Routes = () => (
  <Switch>
    <Route path={routes.HOME} component={HomePage} exact />
    <Route path={routes.GAME} component={GamePage} exact />
    <Route path={routes.ROOMS} component={RoomsManagerPage} exact />
    <Route path={routes.TECH} component={TechPage} exact />
    <Route path={routes.AUTH} component={AuthContainer} />
  </Switch>
)
