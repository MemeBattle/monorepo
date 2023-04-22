import type { AuthRoutes } from '../types/authRoutes'

export const ROUTES: AuthRoutes = {
  LOGIN: '/login',
  REGISTER: '/register',
  CONFIRM_EMAIL: '/confirm',
  PROFILE: '/profile',
} as const
