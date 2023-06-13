import type { BlogPost } from 'contentlayer/generated'
import type { Language } from '../../../../i18n/i18n.settings'

export function createLocalesBySlugMap(posts: Pick<BlogPost, 'slug' | 'lang'>[]) {
  return posts.reduce<Map<BlogPost['slug'], Set<Language>>>((acc, blogPost) => {
    if (acc.has(blogPost.slug)) {
      acc.get(blogPost.slug)?.add(blogPost.lang)
    } else {
      acc.set(blogPost.slug, new Set([blogPost.lang]))
    }
    return acc
  }, new Map())
}
