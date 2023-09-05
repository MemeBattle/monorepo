import type { BlogPost } from 'contentlayer/generated'
import { allBlogPosts } from 'contentlayer/generated'
import type { Language } from '@/i18n/i18n.settings'

export { allBlogPosts }
export type BlogPostWithTranslates = BlogPost & { translates: { [key in Language]?: BlogPost } }

export const uniqTags = [
  ...allBlogPosts.reduce<Set<string>>((acc, { tags = [] }) => {
    tags.forEach(tag => {
      acc.add(tag)
    })
    return acc
  }, new Set<string>()),
]

export const allBlogPostsWithTranslates: BlogPostWithTranslates[] = allBlogPosts.map((blogPost, index, blogPosts) => ({
  ...blogPost,
  translates: blogPosts
    .filter(({ slug }) => blogPost.slug === slug)
    .reduce((translatesAcc, blogPost) => ({ ...translatesAcc, [blogPost.lang]: blogPost }), {}),
}))
