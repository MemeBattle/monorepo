import React from 'react'
import { Routes as ReactRouterRoutes, Route } from 'react-router-dom'

import { GamePage, HomePage, TechPage, RoomsManagerPage } from 'pages'
import { AuthContainer } from 'containers/AuthContainer'
import { routes } from 'utils/constants'

export const Routes = () => (
  <ReactRouterRoutes>
    <Route index element={<HomePage />} />
    <Route path={routes.GAME} element={<GamePage />} />
    <Route path={routes.ROOMS} element={<RoomsManagerPage />} />
    <Route path={routes.TECH} element={<TechPage />} />
    <Route path={routes.AUTH_ALL} element={<AuthContainer />} />
  </ReactRouterRoutes>
)
