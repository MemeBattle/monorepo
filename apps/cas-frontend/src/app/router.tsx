import { createBrowserRouter, Outlet } from 'react-router'
import type { RouteObject } from 'react-router'

import { SignInPage } from '#pages/sign-in/SignInPage'
import { CreateAccountPage } from '#pages/create-account/CreateAccountPage'
import { DashboardPage } from '#pages/dashboard/DashboardPage'
import { routes } from './routes'

const RootLayout = () => (
  <div className="min-h-dvh bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-10 px-6 py-12">
      <p className="text-xs font-semibold tracking-[0.2em] text-neutral-500 uppercase">CAS</p>
      <main className="flex flex-col gap-6">
        <Outlet />
      </main>
    </div>
  </div>
)

// Exported separately so tests can mount the same routes in a memory router.
export const appRoutes: RouteObject[] = [
  {
    path: routes.DASHBOARD,
    element: <RootLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: routes.SIGN_IN, element: <SignInPage /> },
      { path: routes.CREATE_ACCOUNT, element: <CreateAccountPage /> },
    ],
  },
]

export const router = createBrowserRouter(appRoutes)
