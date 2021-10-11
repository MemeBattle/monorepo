import type { UserModel } from '../../api/apiTypes'

export type User = UserModel & {
  isLoading?: boolean
}
