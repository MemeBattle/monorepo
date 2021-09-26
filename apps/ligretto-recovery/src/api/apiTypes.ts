export type UserModel =
  | {
      isTemporary: false
      _id: string
      username: string
      avatar?: string
    }
  | {
      isTemporary: true
      _id: string
    }
