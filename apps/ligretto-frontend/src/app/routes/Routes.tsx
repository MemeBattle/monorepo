import { Routes as ReactRouterRoutes, Route } from 'react-router-dom'

import { HomePage } from 'pages/home/HomePage'
import { GamePageContainer } from 'pages/game/GamePageContainer'
import { AuthContainer } from '../AuthContainer'
import { routes } from 'shared/constants'

export const Routes = () => (
  <ReactRouterRoutes>
    <Route index element={<HomePage />} />
    <Route path={routes.GAME} element={<GamePageContainer />} />
    <Route path={routes.AUTH_ALL} element={<AuthContainer />} />
  </ReactRouterRoutes>
)
