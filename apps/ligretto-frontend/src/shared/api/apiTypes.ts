export type UserModel = { casId: string } & (
  | {
      isTemporary: false
      username: string
      avatar?: string
    }
  | {
      isTemporary: true
    }
)
