import { ROUTES as AuthFrontRoutes } from '@memebattle/auth-front'

export const routes = {
  HOME: '/',
  GAME: '/game/:roomUuid',
  AUTH_ALL: '/auth/*',
  AUTH_ROOT: '/auth',
  OBBOARDING: '/onboarding',
} as const

export const authRoutes = Object.entries(AuthFrontRoutes).reduce<Record<keyof typeof AuthFrontRoutes, string>>(
  (acc, [authRouteKey, authRoute]) => ({ ...acc, [authRouteKey]: `${routes.AUTH_ROOT}${authRoute}` }),
  AuthFrontRoutes,
)
