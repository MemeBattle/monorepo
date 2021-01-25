import { FORM_ERROR } from 'final-form'

export interface LoginFormValues {
  username: string
  password: string
}

export type LoginFormSubmissionError = Partial<{
  username: string
  password: string
  [FORM_ERROR]: string
}>
