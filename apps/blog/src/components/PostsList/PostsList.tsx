'use client'

import { useSearchParams } from 'next/navigation'
import type { BlogPost } from 'contentlayer/generated'
import { PostsListItem } from '../PostsListItem'
import type { Language } from '../../i18n/i18n.settings'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import Link from 'next/link'

interface PostsListProps {
  posts: BlogPost[]
  locale: Language
  emptyListPlaceholder: ReactNode
}

function filterBlogPosts(blogPosts: BlogPost[], search = '', tags: string[] = []): BlogPost[] {
  const keywords = search
    .toLowerCase()
    .split(' ')
    .filter(part => part !== '')

  const filteredByTag = tags.length > 0 ? blogPosts.filter(blogPost => blogPost.tags?.some(tag => tags.includes(tag))) : blogPosts

  if (keywords.length === 0) {
    return filteredByTag
  }

  return filteredByTag.filter(blogPost => {
    const words = (blogPost.title + ' ' + blogPost.summary + ' ' + blogPost.body.code).toLowerCase().split(' ')

    return keywords.every(keyWord => words.some(word => word.startsWith(keyWord)))
  })
}
export function PostsList({ posts, locale, emptyListPlaceholder }: PostsListProps) {
  const searchParams = useSearchParams()

  const filteredPosts = useMemo(() => filterBlogPosts(posts, searchParams.get('search') ?? '', searchParams.getAll('tags')), [searchParams, posts])

  return (
    <>
      {filteredPosts.map((post: BlogPost) => (
        <Link key={post.slug} href={`/${locale}/posts/${post.slug}`} className="group">
          <PostsListItem
            tags={post.tags?.map(tag => ({ text: tag, isActive: searchParams.getAll('tags').includes(tag) }))}
            title={post.title}
            summary={post.summary}
            imageSrc={post.image}
            imageDescription={post.imageDescription}
            publishedAt={post.publishedAt}
          />
        </Link>
      ))}
      {filteredPosts.length === 0 ? emptyListPlaceholder : null}
    </>
  )
}
