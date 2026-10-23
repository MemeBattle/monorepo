import type { AccountType } from '@memebattle/ligretto-auth/contract'

/** A user as `GET /api/users?ids=` answers it: the snapshot the core backend keeps of the account. */
export interface UserModel {
  casId: string
  accountType: AccountType
  /** `null` for a guest and for a full account that released none. */
  displayName: string | null
  /** `null` until CAS releases a picture. */
  avatarUrl: string | null
}
