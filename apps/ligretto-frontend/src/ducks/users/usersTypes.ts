import type { AuthUser } from '#shared/api'

export type User = AuthUser & {
  isLoading?: boolean
}
