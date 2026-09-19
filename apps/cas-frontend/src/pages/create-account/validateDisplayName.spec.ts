import { describe, expect, it } from 'vitest'

import { MAX_LABEL_LENGTH } from '#shared/lib/label'
import { messages, validateDisplayName } from './validateDisplayName'

describe('validateDisplayName', () => {
  it('accepts a name up to the cap', () => {
    expect(validateDisplayName('Ада')).toBeNull()
    expect(validateDisplayName('a'.repeat(MAX_LABEL_LENGTH))).toBeNull()
  })

  it('says what is wrong in the words of this screen', () => {
    expect(validateDisplayName('')).toBe(messages.empty)
    expect(validateDisplayName('a'.repeat(MAX_LABEL_LENGTH + 1))).toBe(messages.tooLong)
  })
})
