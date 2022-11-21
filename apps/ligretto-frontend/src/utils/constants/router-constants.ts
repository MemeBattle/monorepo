import { ROUTES as AuthFrontRoutes } from '@memebattle/auth-front'

export const routes = {
  HOME: '/',
  GAME: '/game/:roomUuid',
  ROOMS: '/rooms',
  TECH: '/tech/:gameId',
  AUTH: '/auth',
} as const

export const authRoutes = Object.entries(AuthFrontRoutes).reduce<Record<keyof typeof AuthFrontRoutes, string>>(
  (acc, [authRouteKey, authRoute]) => ({ ...acc, [authRouteKey]: `${routes.AUTH}/#${authRoute}` }),
  AuthFrontRoutes,
)
