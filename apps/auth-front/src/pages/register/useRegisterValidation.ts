import { validate as validateEmail } from 'email-validator'
import type { RegisterFormValidationErrors, RegisterFormValues } from './RegisterPage.types'
import { useCallback } from 'react'
import { t } from '../../utils/i18n'

export const useRegisterValidation = () =>
  useCallback((values: RegisterFormValues): RegisterFormValidationErrors => {
    const USERNAME_MIN_LENGTH = 2
    const USERNAME_MAX_LENGTH = 20
    const PASSWORD_MIN_LENGTH = 8

    const errors: RegisterFormValidationErrors = {}
    if (!validateEmail(values.email)) {
      errors.email = t.validation.email
    }

    if (!(values.username.trim().length >= USERNAME_MIN_LENGTH && values.username.trim().length <= USERNAME_MAX_LENGTH)) {
      errors.username = t.validation.username
    }

    if (values.password.trim().length < PASSWORD_MIN_LENGTH) {
      errors.password = t.validation.password
    } else if (values.password !== values.confirmPassword) {
      errors.confirmPassword = t.validation.confirmPassword
    }

    return errors
  }, [])
