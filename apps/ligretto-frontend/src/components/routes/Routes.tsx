import React from 'react'
import { Routes as ReactRouterRoutes, Route } from 'react-router-dom'

import { HomePage } from 'pages/Home'
import { GamePage } from 'pages/game'
import { TechPage } from 'pages/Tech'
import { AuthContainer } from 'containers/AuthContainer'
import { routes } from 'utils/constants'

export const Routes = () => (
  <ReactRouterRoutes>
    <Route index element={<HomePage />} />
    <Route path={routes.GAME} element={<GamePage />} />
    <Route path={routes.TECH} element={<TechPage />} />
    <Route path={routes.AUTH_ALL} element={<AuthContainer />} />
  </ReactRouterRoutes>
)
