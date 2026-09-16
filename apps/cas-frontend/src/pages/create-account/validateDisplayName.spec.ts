import { describe, expect, it } from 'vitest'

import { MAX_DISPLAY_NAME_LENGTH, messages, normalizeDisplayName, validateDisplayName } from './validateDisplayName'

describe('normalizeDisplayName', () => {
  it('maps every space separator to ASCII space, trims and collapses', () => {
    expect(normalizeDisplayName('  Ада  Лавлейс　')).toBe('Ада Лавлейс')
    expect(normalizeDisplayName(' ')).toBe('')
  })

  it('composes decomposed characters, as the server does', () => {
    expect(normalizeDisplayName('José')).toBe('José')
    expect(normalizeDisplayName('가')).toBe('가')
  })

  it('leaves what the server rejects for the server to reject', () => {
    // `trim()` would remove the zero-width space; the server answers `invalid_display_name` for it instead.
    expect(normalizeDisplayName('Ада​')).toBe('Ада​')
    expect(normalizeDisplayName('​')).toBe('​')
  })

  it('keeps emoji as typed', () => {
    expect(normalizeDisplayName('Ада ❤️')).toBe('Ада ❤️')
  })
})

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

  it('counts decomposed characters after NFC, like the server', () => {
    // 33 letters typed as base plus combining acute: 66 code points before NFC, 33 after.
    const decomposed = 'é'.repeat(33)
    expect([...decomposed].length).toBe(66)
    expect(validateDisplayName(normalizeDisplayName(decomposed))).toBeNull()

    expect(validateDisplayName(normalizeDisplayName('é'.repeat(MAX_DISPLAY_NAME_LENGTH + 1)))).toBe(messages.tooLong)
  })
})
