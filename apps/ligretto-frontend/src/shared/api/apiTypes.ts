import type { AccountType } from '@memebattle/ligretto-auth/contract'

export interface UserModel {
  casId: string
  accountType: AccountType
  displayName: string | null
  avatarUrl: string | null
}
