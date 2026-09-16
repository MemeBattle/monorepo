import { WebAuthnError } from '@simplewebauthn/browser'
import { describe, expect, it } from 'vitest'

import { ApiError } from '#shared/api/request'
import { isCeremonyCancelled } from './ceremonies'

const notAllowed = () => new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError')

describe('isCeremonyCancelled', () => {
  it('recognises the browser’s NotAllowedError', () => {
    expect(isCeremonyCancelled(notAllowed())).toBe(true)
  })

  it('sees through the wrapper @simplewebauthn/browser puts around it', () => {
    const cause = notAllowed()
    const wrapped = new WebAuthnError({ message: cause.message, code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', cause })

    expect(isCeremonyCancelled(wrapped)).toBe(true)
  })

  it('is false for everything else', () => {
    for (const error of [
      new DOMException('bad origin', 'SecurityError'),
      new ApiError(404, 'registration_not_found', ''),
      new TypeError('Failed to fetch'),
      'NotAllowedError',
      null,
    ]) {
      expect(isCeremonyCancelled(error)).toBe(false)
    }
  })
})
