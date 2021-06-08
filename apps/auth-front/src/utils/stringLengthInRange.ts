/**
 * Check string length in range
 *
 * @param stringToCheck
 * @param minLength
 * @param maxLength
 * @param needTrim
 */
export const stringLengthInRange = (stringToCheck = '', { minLength = 0, maxLength = Infinity, needTrim = true }): boolean => {
  const sanitizedString = needTrim ? stringToCheck.trim() : stringToCheck

  return sanitizedString.length >= minLength && sanitizedString.length <= maxLength
}
