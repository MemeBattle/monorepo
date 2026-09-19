export interface ProfileFormValues {
  username: string
  email: string
}

export type ProfileFormValidationErrors = Partial<{
  username: string
}>
