import type { BlogPost } from 'contentlayer/generated'
import type { Language } from '../../../../i18n/i18n.settings'
import { fallbackLanguage } from '../../../../i18n/i18n.settings'

export type LocalesBySlug = Map<string, Set<Language>>

export const isPostShouldBePickedByLocale = (localesBySlug: LocalesBySlug, post: Pick<BlogPost, 'slug' | 'lang'>, locale: Language): boolean => {
  /**
   * Post in current locale should be picked
   */
  if (post.lang === locale) {
    return true
  }

  const postLocales = localesBySlug.get(post.slug) || new Set()

  /**
   * Post in fallback locale should be picked if it doesn't exist in current
   */
  return post.lang === fallbackLanguage && !postLocales.has(locale)
}
