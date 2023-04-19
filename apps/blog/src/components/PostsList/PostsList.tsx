'use client'

import { useSearchParams } from 'next/navigation'
import type { BlogPost } from 'contentlayer/generated'
import type { Route } from 'next'
import { PostsListItem } from '../PostsListItem'
import type { Language } from '../../i18n/i18n.settings'
import { useMemo } from 'react'
import { Empty } from './Empty'

interface PostsListProps {
  posts: BlogPost[]
  locale: Language
  emptyListMessage: string
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
export function PostsList({ posts, locale, emptyListMessage }: PostsListProps) {
  const searchParams = useSearchParams()

  const filteredPosts = useMemo(() => filterBlogPosts(posts, searchParams.get('search') ?? '', searchParams.getAll('tags')), [searchParams, posts])

  return (
    <>
      {filteredPosts.map((post: BlogPost) => (
        <PostsListItem
          key={post.slug}
          tags={post.tags?.map(tag => ({ text: tag, isActive: searchParams.getAll('tags').includes(tag) }))}
          title={post.title}
          summary={post.summary}
          imageSrc={post.image}
          imageDescription={post.imageDescription}
          publishedAt={post.publishedAt}
          postUrl={`/${locale}/posts/${post.slug}` as Route}
        />
      ))}
      {filteredPosts.length === 0 ? <Empty message={emptyListMessage} /> : null}
    </>
  )
}
