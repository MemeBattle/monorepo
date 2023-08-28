import type { ProfileFormValidationErrors, ProfileFormValues } from './ProfilePage.types'
import { useCallback } from 'react'
import { t } from '../../utils/i18n'
import { stringLengthInRange } from '../../utils/stringLengthInRange'

const USERNAME_MIN_LENGTH = 2
const USERNAME_MAX_LENGTH = 20

export const useProfileValidation = () =>
  useCallback((values: ProfileFormValues): ProfileFormValidationErrors => {
    const errors: ProfileFormValidationErrors = {}
    const isValidUsername = stringLengthInRange(values.username, { minLength: USERNAME_MIN_LENGTH, maxLength: USERNAME_MAX_LENGTH })

    if (values.username && !isValidUsername) {
      errors.username = t.validation.username(USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH)
    }

    return errors
  }, [])
