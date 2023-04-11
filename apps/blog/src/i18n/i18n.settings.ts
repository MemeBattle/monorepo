export const fallbackLanguage = 'en'
export const languages = [fallbackLanguage, 'ru'] as const

export type Language = typeof languages[number]
export const defaultNS = 'common'

export function getOptions(lng = fallbackLanguage, ns = defaultNS) {
  return {
    // debug: true,
    supportedLngs: languages,
    fallbackLng: fallbackLanguage,
    lng,
    fallbackNS: defaultNS,
    defaultNS,
    ns,
  }
}
