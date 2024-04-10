import type { UserModel } from '#shared/api/apiTypes'

export type User = UserModel & {
  isLoading?: boolean
}
