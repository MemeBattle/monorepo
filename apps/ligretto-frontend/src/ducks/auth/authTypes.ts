import type { AuthUser } from '#shared/api'

type AccountType = AuthUser['accountType']

export interface AuthState {
  userId: string
  /** Kept in memory only. */
  accessToken: string
  /** Unix timestamp in milliseconds. */
  expiresAt: number
  accountType: AccountType | null
  isLoading: boolean
  isBootstrapped: boolean
}

export interface AuthIdentity {
  userId: string
  accessToken: string
  expiresAt: number
  accountType: AccountType
}
