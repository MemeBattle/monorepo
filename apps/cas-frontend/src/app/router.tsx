import { createBrowserRouter, Outlet } from 'react-router'
import type { RouteObject } from 'react-router'

import { SignInPage } from '#pages/sign-in/SignInPage'
import { CreateAccountPage } from '#pages/create-account/CreateAccountPage'
import { DashboardPage } from '#pages/dashboard/DashboardPage'
import { LoadingScreen } from '#pages/loading/LoadingScreen'
import { ErrorScreen } from '#pages/error/ErrorScreen'
import { requireNoSession, requireSession } from './gates'
import { routes } from './routes'

const appRoutes: RouteObject[] = [
  {
    path: routes.DASHBOARD,
    // Each page draws its own Screen; the shell only holds the fallbacks.
    element: <Outlet />,
    HydrateFallback: LoadingScreen,
    errorElement: <ErrorScreen />,
    // Every page asks `/api/me` on its own, so the gate runs on each navigation and the answer is never stale.
    children: [
      { index: true, loader: requireSession, element: <DashboardPage /> },
      { path: routes.SIGN_IN, loader: requireNoSession, element: <SignInPage /> },
      { path: routes.CREATE_ACCOUNT, loader: requireNoSession, element: <CreateAccountPage /> },
    ],
  },
]

export const router = createBrowserRouter(appRoutes)
