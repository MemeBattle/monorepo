import { FORM_ERROR } from 'final-form'

export interface RegisterFormValues {
  username: string
  email: string
  password: string
  confirmPassword: string
}

export type RegisterFormSubmissionErrors = Partial<{
  username: string
  email: string
  password: string
  [FORM_ERROR]: string
}>

export type RegisterFormValidationErrors = Partial<{
  email: string
  password: string
  confirmPassword: string
  username: string
}>
