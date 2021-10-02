export type UserModel =
  | {
      isTemporary: false
      casId: string
      username: string
      avatar?: string
    }
  | {
      isTemporary: true
      casId: string
    }
