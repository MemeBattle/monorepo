import { validate as validateEmail } from 'email-validator'
import type { RegisterFormValidationErrors, RegisterFormValues } from './RegisterPage.types'
import { useCallback } from 'react'
import { t } from '../../utils/i18n'
import { stringLengthInRange } from '../../utils/stringLengthInRange'

const USERNAME_MIN_LENGTH = 2
const USERNAME_MAX_LENGTH = 20
const PASSWORD_MIN_LENGTH = 6
const PASSWORD_MAX_LENGTH = 256

export const useRegisterValidation = () =>
  useCallback((values: RegisterFormValues): RegisterFormValidationErrors => {
    const errors: RegisterFormValidationErrors = {}
    const isValidUsername = stringLengthInRange(values.username, { minLength: USERNAME_MIN_LENGTH, maxLength: USERNAME_MAX_LENGTH })
    const isValidEmail = validateEmail(values?.email || '')
    const isValidPassword = stringLengthInRange(values.password, { minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })

    if (!isValidEmail) {
      errors.email = t.validation.email
    }

    if (!isValidUsername) {
      errors.username = t.validation.username(USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH)
    }

    if (!isValidPassword) {
      errors.password = t.validation.password(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
    }

    if ((values.password && values.password !== values.confirmPassword) || !isValidPassword) {
      errors.confirmPassword = t.validation.confirmPassword
    }

    if (!values.password && values.confirmPassword) {
      errors.confirmPassword = t.validation.passwordFirst
    }

    return errors
  }, [])
