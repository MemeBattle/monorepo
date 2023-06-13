import type { BlogPost } from 'contentlayer/generated'
import { allBlogPosts } from 'contentlayer/generated'
import { createLocalesBySlugMap } from '../_utils/createLocalesBySlugMap'

export { allBlogPosts }
export type { BlogPost }

export const uniqTags = [
  ...allBlogPosts.reduce<Set<string>>((acc, { tags = [] }) => {
    tags.forEach(tag => {
      acc.add(tag)
    })
    return acc
  }, new Set<string>()),
]

export const localesBySlug = createLocalesBySlugMap(allBlogPosts)
