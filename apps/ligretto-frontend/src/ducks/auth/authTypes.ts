import type { AccountType } from '@memebattle/ligretto-auth/contract'

export interface AuthState {
  /** The account id (`sub`); `''` until the first `me` answer. */
  userId: string
  /** The access token for the gameplay handshake; `''` until the first answer. Kept in the store only, never persisted. */
  accessToken: string
  /** When `accessToken` expires, epoch milliseconds; `0` until the first answer. */
  expiresAt: number
  accountType: AccountType | null
  /** A `me` request is in flight: the guard against a duplicate. */
  isLoading: boolean
  /** The first `me` answered: the routes may render. */
  isBootstrapped: boolean
}

/** What a `me` answer writes into the state. */
export interface AuthIdentity {
  userId: string
  accessToken: string
  expiresAt: number
  accountType: AccountType
}
