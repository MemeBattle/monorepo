import { createLocalesBySlugMap } from './createLocalesBySlugMap'
import { expect } from '@playwright/test'

describe('createLocalesBySlugMap', () => {
  it('Should return empty map for empty array', () => {
    expect(createLocalesBySlugMap([])).toEqual(new Map())
  })

  it('Should return map of locales by slug', () => {
    expect(
      createLocalesBySlugMap([
        { slug: 'first', lang: 'ru' },
        { slug: 'first', lang: 'en' },
        { slug: 'second', lang: 'ru' },
      ]),
    ).toEqual(
      new Map([
        ['first', new Set(['ru', 'en'])],
        ['second', new Set(['ru'])],
      ]),
    )
  })
})
