import { validate as validateEmail } from 'email-validator'
import type { RegisterFormValidationErrors, RegisterFormValues } from './RegisterPage.types'
import { useCallback } from 'react'
import { t } from '../../utils/i18n'

export const useRegisterValidation = () =>
  useCallback((values: RegisterFormValues): RegisterFormValidationErrors => {
    const errors: RegisterFormValidationErrors = {}
    if (!validateEmail(values.email)) {
      errors.email = t.validation.email
    }

    if (!(values.username.length > 2 && values.username.length < 20)) {
      errors.username = t.validation.username
    }

    if (values.password.trim().length < 8) {
      errors.password = t.validation.password
    } else if (values.password !== values.confirmPassword) {
      errors.confirmPassword = t.validation.confirmPassword
    }

    return errors
  }, [])
