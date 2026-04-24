import { Routes as ReactRouterRoutes, Route } from 'react-router-dom'

import { HomePage } from '#pages/home/HomePage'
import { GamePage } from '#pages/game/GamePage'
import { OnboardingPage } from '#pages/onboarding/OnboardingPage'
import { AuthContainer } from '../AuthContainer'
import { routes } from '#shared/constants'

export const Routes = () => (
  <ReactRouterRoutes>
    <Route index element={<HomePage />} />
    <Route path={routes.GAME} element={<GamePage />} />
    <Route path={routes.AUTH_ALL} element={<AuthContainer />} />
    <Route path={routes.ONBOARDING} element={<OnboardingPage />} />
  </ReactRouterRoutes>
)
