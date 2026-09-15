import { describe, expect, it } from 'vitest'

import { MAX_DISPLAY_NAME_LENGTH, messages, validateDisplayName } from './validateDisplayName'

describe('validateDisplayName', () => {
  it('accepts a name up to the cap', () => {
    expect(validateDisplayName('Ада')).toBeNull()
    expect(validateDisplayName('a'.repeat(MAX_DISPLAY_NAME_LENGTH))).toBeNull()
  })

  it('rejects an empty name', () => {
    expect(validateDisplayName('')).toBe(messages.empty)
  })

  it('counts code points like the server, not UTF-16 units', () => {
    // An astral emoji is one code point but two UTF-16 units.
    const emoji = '😀'.repeat(MAX_DISPLAY_NAME_LENGTH)
    expect(emoji.length).toBe(MAX_DISPLAY_NAME_LENGTH * 2)
    expect(validateDisplayName(emoji)).toBeNull()

    expect(validateDisplayName('a'.repeat(MAX_DISPLAY_NAME_LENGTH + 1))).toBe(messages.tooLong)
  })
})
