import { WebAuthnError } from '@simplewebauthn/browser'
import { describe, expect, it } from 'vitest'

import { ApiError } from '#shared/api/request'
import { toFailure } from './toFailure'

const notAllowed = () => new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError')

describe('toFailure', () => {
  it('names a cancelled ceremony after its context', () => {
    const failure = toFailure(notAllowed(), 'createAccount')

    expect(failure.title).toBe('Создание отменено')
    expect(failure.text).toContain('попробуйте ещё раз')
  })

  it('sees through the wrapper @simplewebauthn/browser puts around the DOMException', () => {
    const cause = notAllowed()
    const wrapped = new WebAuthnError({ message: cause.message, code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', cause })

    expect(toFailure(wrapped, 'createAccount').title).toBe('Создание отменено')
  })

  it('never shows the raw message of an unknown error', () => {
    const raw = 'TypeError: Failed to fetch'

    for (const error of [new TypeError(raw), new ApiError(503, 'database_unavailable', raw), new DOMException(raw, 'SecurityError'), raw]) {
      const failure = toFailure(error, 'createAccount')
      expect(failure.title).toBe('Что-то пошло не так')
      expect(failure.text).not.toContain(raw)
    }
  })
})
