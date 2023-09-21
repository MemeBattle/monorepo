import type { BlogPost } from 'contentlayer/generated'
import { allBlogPosts } from 'contentlayer/generated'
import { convertMarkdownToHtml } from './converter'

import { getTranslation } from '@/i18n'
import { generateFullUrl } from '@/utils/generateFullUrl'

export type FeedBlogPost = BlogPost & { content: string; url: string }

export type ChannelInfo = {
  title: string
  description: string
  atomUrl: string
  url: string
  updatedAt: string
  posts: FeedBlogPost[]
}

export const createChannelInfo = async (lang: string): Promise<ChannelInfo> => {
  const feedPosts = await Promise.all(
    [...allBlogPosts]
      .filter(post => post.lang === lang)
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .map(async post => ({
        ...post,
        url: generateFullUrl(`/${lang}/posts/${post.slug}`),
        content: await convertMarkdownToHtml(post.body.raw),
      })),
  )

  const [latestPost] = feedPosts

  const { t } = await getTranslation(lang)
  const channelMetadata = {
    title: t('main.title'),
    description: t('main.description'),
    atomUrl: generateFullUrl(`/feed/${lang}`),
    url: generateFullUrl(`/${lang}/posts`),
    updatedAt: latestPost.publishedAt,
  }

  return { ...channelMetadata, posts: feedPosts }
}
