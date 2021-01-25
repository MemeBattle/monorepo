import { FORM_ERROR } from 'final-form'

export interface RegisterFormValues {
  username: string
  email: string
  password: string
}

export type RegisterFormSubmissionErrors = Partial<{
  username: string
  email: string
  password: string
  [FORM_ERROR]: string
}>
