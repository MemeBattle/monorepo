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
    if (!validateEmail(values?.email || '')) {
      errors.email = t.validation.email
    }

    if (!stringLengthInRange(values.username, { minLength: USERNAME_MIN_LENGTH, maxLength: USERNAME_MAX_LENGTH })) {
      errors.username = t.validation.username(USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH)
    }

    if (!stringLengthInRange(values.password, { minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })) {
      errors.password = t.validation.password(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
    } else if (values.password !== values.confirmPassword) {
      errors.confirmPassword = t.validation.confirmPassword
    }

    return errors
  }, [])
