import { isPostShouldBePickedByLocale } from './isPostShouldBePickedByLocale'

describe('isPostShouldBePickedByLocale', () => {
  it('Should return true if post in selected locale', () => {
    expect(isPostShouldBePickedByLocale(new Map([['first', new Set(['en', 'ru'])]]), { slug: 'first', lang: 'ru' }, 'ru')).toEqual(true)
  })

  it('Should return false if post not in selected locale', () => {
    expect(isPostShouldBePickedByLocale(new Map([['first', new Set(['en', 'ru'])]]), { slug: 'first', lang: 'ru' }, 'en')).toEqual(false)
  })

  it('Should return false if post not in selected locale', () => {
    expect(isPostShouldBePickedByLocale(new Map([['first', new Set(['en', 'ru'])]]), { slug: 'first', lang: 'en' }, 'ru')).toEqual(false)
  })

  it('Should return true if post not exist in selected locale but fallback exits', () => {
    expect(isPostShouldBePickedByLocale(new Map([['first', new Set(['en'])]]), { slug: 'first', lang: 'en' }, 'ru')).toEqual(true)
  })
})
