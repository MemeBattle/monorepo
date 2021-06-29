import type { UserModel } from '../../api/apiTypes'

export interface User extends UserModel {
  isLoading?: boolean
}
