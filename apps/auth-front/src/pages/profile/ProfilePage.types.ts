import { FORM_ERROR } from 'final-form'

export interface ProfileFormValues {
  username: string
  email: string
  password: string
}

export type LoginFormSubmissionError = Partial<{
  username: string
  password: string
  [FORM_ERROR]: string
}>
