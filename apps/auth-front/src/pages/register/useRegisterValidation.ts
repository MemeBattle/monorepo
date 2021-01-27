import { validate as validateEmail } from 'email-validator'
import type { RegisterFormValidationErrors, RegisterFormValues } from './RegisterPage.types'
import { useCallback } from 'react'

export const useRegisterValidation = () =>
  useCallback((values: RegisterFormValues): RegisterFormValidationErrors => {
    const errors: RegisterFormValidationErrors = {}

    if (validateEmail(values.email)) {
      errors.email = 'Email format is incorrect'
    }

    if (values.password.trim().length < 6) {
      errors.password = 'Password should contain at least 6 characters'
    } else if (values.password !== values.confirmPassword) {
      errors.confirmPassword = 'Passwords are not the same'
    }

    return errors
  }, [])
