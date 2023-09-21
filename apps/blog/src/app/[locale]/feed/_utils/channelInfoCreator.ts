import type { BlogPost } from 'contentlayer/generated'
import { allBlogPosts } from 'contentlayer/generated'
import { convertMarkdownToHtml } from './converter'

import { useTranslation } from '@/i18n'
import { generateFullUrl } from '@/utils/generateFullUrl'
import type { Language } from '@/i18n/i18n.settings'

export type FeedBlogPost = BlogPost & { content: string; url: string }

export type ChannelInfo = {
  title: string
  description: string
  atomUrl: string
  url: string
  updatedAt: string
  posts: FeedBlogPost[]
}

export const createChannelInfo = async (lang: Language): Promise<ChannelInfo> => {
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

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { t } = await useTranslation(lang)
  const channelMetadata = {
    title: t('main.title'),
    description: t('main.description'),
    atomUrl: generateFullUrl(`/feed/${lang}`),
    url: generateFullUrl(`/${lang}/posts`),
    updatedAt: latestPost.publishedAt,
  }

  return { ...channelMetadata, posts: feedPosts }
}
