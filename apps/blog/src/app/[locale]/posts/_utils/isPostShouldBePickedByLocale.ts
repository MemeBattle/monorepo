import type { BlogPostWithTranslates } from '../_content'
import type { Language } from '../../../../i18n/i18n.settings'
import { fallbackLanguage } from '../../../../i18n/i18n.settings'

export const isPostShouldBePickedByLocale = (post: Pick<BlogPostWithTranslates, 'slug' | 'lang' | 'translates'>, locale: Language): boolean => {
  /**
   * Post in current locale should be picked
   */
  if (post.lang === locale) {
    return true
  }

  /**
   * Post in fallback locale should be picked if it doesn't exist in current
   */
  return post.lang === fallbackLanguage && !post.translates[locale]
}
