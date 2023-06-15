import type { Language } from '../../../../i18n/i18n.settings'
import { isPostShouldBePickedByLocale } from './isPostShouldBePickedByLocale'
import type { BlogPostWithTranslates } from '../_content'

export function filterBlogPosts(blogPosts: BlogPostWithTranslates[], locale: Language, search = '', tags: string[] = []): BlogPostWithTranslates[] {
  const keywords = search
    .toLowerCase()
    .split(' ')
    .filter(part => part !== '')

  const filteredByLocale = blogPosts.filter(blogPost => isPostShouldBePickedByLocale(blogPost, locale))

  const filteredByTag = tags.length > 0 ? filteredByLocale.filter(blogPost => blogPost.tags?.some(tag => tags.includes(tag))) : filteredByLocale

  if (keywords.length === 0) {
    return filteredByTag
  }

  return filteredByTag.filter(blogPost => {
    const words = (blogPost.title + ' ' + blogPost.summary + ' ' + blogPost.body.raw).toLowerCase().split(' ')

    return keywords.every(keyWord => words.some(word => word.startsWith(keyWord)))
  })
}
