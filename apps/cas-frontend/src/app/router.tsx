import { createBrowserRouter, Outlet } from 'react-router'
import type { RouteObject } from 'react-router'

import { getMe } from '#entities/session'
import { SignInPage } from '#pages/sign-in/SignInPage'
import { CreateAccountPage } from '#pages/create-account/CreateAccountPage'
import { DashboardPage } from '#pages/dashboard/DashboardPage'
import { LoadingScreen } from '#pages/loading/LoadingScreen'
import { ErrorScreen } from '#pages/error/ErrorScreen'
import { routes } from './routes'

const appRoutes: RouteObject[] = [
  {
    path: routes.DASHBOARD,
    // Each page draws its own Screen; the shell only holds the fallbacks.
    element: <Outlet />,
    HydrateFallback: LoadingScreen,
    errorElement: <ErrorScreen />,
    children: [
      // Without a session `/api/me` is a 401 and the error screen offers sign-in; the redirect is #712.
      { index: true, loader: getMe, element: <DashboardPage /> },
      { path: routes.SIGN_IN, element: <SignInPage /> },
      { path: routes.CREATE_ACCOUNT, element: <CreateAccountPage /> },
    ],
  },
]

export const router = createBrowserRouter(appRoutes)
