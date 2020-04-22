import React from 'react'
import { Switch, Route } from 'react-router-dom'

import { routes } from 'utils/constants'
import { GamePage, HomePage, RoomsPage, NewRoomPage } from 'pages'

export const Routes = () => (
  <Switch>
    <Route path={routes.HOME} component={HomePage} exact />
    <Route path={routes.GAME} component={GamePage} exact />
    <Route path={routes.ROOMS} component={RoomsPage} exact />
    <Route path={routes.NEW_ROOM} component={NewRoomPage} exact />
  </Switch>
)
