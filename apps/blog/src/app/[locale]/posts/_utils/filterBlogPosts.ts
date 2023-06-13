import type { BlogPost } from 'contentlayer/generated'
import type { Language } from '../../../../i18n/i18n.settings'
import type { LocalesBySlug } from './isPostShouldBePickedByLocale'
import { isPostShouldBePickedByLocale } from './isPostShouldBePickedByLocale'

export function filterBlogPosts(blogPosts: BlogPost[], localesBySlug: LocalesBySlug, locale: Language, search = '', tags: string[] = []): BlogPost[] {
  const keywords = search
    .toLowerCase()
    .split(' ')
    .filter(part => part !== '')

  const filteredByLocale = blogPosts.filter(blogPost => isPostShouldBePickedByLocale(localesBySlug, blogPost, locale))

  const filteredByTag = tags.length > 0 ? filteredByLocale.filter(blogPost => blogPost.tags?.some(tag => tags.includes(tag))) : filteredByLocale

  if (keywords.length === 0) {
    return filteredByTag
  }

  return filteredByTag.filter(blogPost => {
    const words = (blogPost.title + ' ' + blogPost.summary + ' ' + blogPost.body.raw).toLowerCase().split(' ')

    return keywords.every(keyWord => words.some(word => word.startsWith(keyWord)))
  })
}
