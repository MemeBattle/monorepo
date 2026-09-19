import { describe, expect, it } from 'vitest'

import { MAX_LABEL_LENGTH, labelProblem, normalizeLabel } from './label'

describe('normalizeLabel', () => {
  it('maps every space separator to ASCII space, trims and collapses', () => {
    expect(normalizeLabel('  Ада  Лавлейс　')).toBe('Ада Лавлейс')
    expect(normalizeLabel(' ')).toBe('')
  })

  it('composes decomposed characters, as the server does', () => {
    expect(normalizeLabel('José')).toBe('José')
    expect(normalizeLabel('가')).toBe('가')
  })

  it('leaves what the server rejects for the server to reject', () => {
    // `trim()` would remove the zero-width space; the server answers with its own code for it instead.
    expect(normalizeLabel('Ада​')).toBe('Ада​')
    expect(normalizeLabel('​')).toBe('​')
  })

  it('keeps emoji as typed', () => {
    expect(normalizeLabel('Ада ❤️')).toBe('Ада ❤️')
  })
})

describe('labelProblem', () => {
  it('accepts a label up to the cap', () => {
    expect(labelProblem('Ада')).toBeNull()
    expect(labelProblem('a'.repeat(MAX_LABEL_LENGTH))).toBeNull()
  })

  it('reports an empty label', () => {
    expect(labelProblem('')).toBe('empty')
  })

  it('counts code points like the server, not UTF-16 units', () => {
    // An astral emoji is one code point but two UTF-16 units.
    const emoji = '😀'.repeat(MAX_LABEL_LENGTH)
    expect(emoji.length).toBe(MAX_LABEL_LENGTH * 2)
    expect(labelProblem(emoji)).toBeNull()

    expect(labelProblem('a'.repeat(MAX_LABEL_LENGTH + 1))).toBe('tooLong')
  })

  it('counts decomposed characters after NFC, like the server', () => {
    // 33 letters typed as base plus combining acute: 66 code points before NFC, 33 after.
    const decomposed = 'é'.repeat(33)
    expect([...decomposed].length).toBe(66)
    expect(labelProblem(normalizeLabel(decomposed))).toBeNull()

    expect(labelProblem(normalizeLabel('é'.repeat(MAX_LABEL_LENGTH + 1)))).toBe('tooLong')
  })
})
