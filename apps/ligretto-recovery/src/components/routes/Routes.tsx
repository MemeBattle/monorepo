import React from 'react'
import { Switch, Route } from 'react-router-dom'
import { AuthContainer } from '../../containers/auth'

import { routes } from 'utils/constants'
import { GamePage, HomePage, RoomsPage, CreateRoomPage, TechPage } from 'pages'

export const Routes = () => (
  <Switch>
    <Route path={routes.HOME} component={HomePage} exact />
    <Route path={routes.GAME} component={GamePage} exact />
    <Route path={routes.ROOMS} component={RoomsPage} exact />
    <Route path={routes.CREATE_ROOM} component={CreateRoomPage} exact />
    <Route path={routes.TECH} component={TechPage} exact />
    <Route path={routes.AUTH} component={AuthContainer} />
  </Switch>
)
