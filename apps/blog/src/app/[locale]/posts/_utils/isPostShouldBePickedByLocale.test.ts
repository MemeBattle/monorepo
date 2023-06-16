import { isPostShouldBePickedByLocale } from './isPostShouldBePickedByLocale'

describe('isPostShouldBePickedByLocale', () => {
  it('Should return true if post in selected locale', () => {
    expect(isPostShouldBePickedByLocale({ slug: 'first', lang: 'ru', translates: {} }, 'ru')).toEqual(true)
  })

  it('Should return false if post not in selected locale', () => {
    expect(isPostShouldBePickedByLocale({ slug: 'first', lang: 'ru', translates: {} }, 'en')).toEqual(false)
  })

  it('Should return true if post in fallback locale and not exist in current', () => {
    expect(isPostShouldBePickedByLocale({ slug: 'first', lang: 'en', translates: {} }, 'ru')).toEqual(true)
  })
})
