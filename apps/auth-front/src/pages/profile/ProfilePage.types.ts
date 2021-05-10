import { FORM_ERROR } from 'final-form'

export interface ProfileFormValues {
  username: string
  email: string
}

export type ProfileFormSubmissionError = Partial<{
  username: string
  [FORM_ERROR]: string
}>
