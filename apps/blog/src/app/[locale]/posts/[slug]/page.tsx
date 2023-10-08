import { notFound } from 'next/navigation'
import type { Metadata, Route } from 'next'
import Image from 'next/image'
import type { WithContext, BlogPosting } from 'schema-dts'

import { Mdx } from '@/components/Mdx'
import type { BlogPost } from 'contentlayer/generated'
import { allBlogPosts, allMemebers } from 'contentlayer/generated'
import { Chip } from '@/components/Chip'
import { JsonLDScript } from '@/components/JsonLDScript'
import { ChipsRow } from '@/components/ChipsRow'
import { isPostShouldBePickedByLocale } from '../_utils/isPostShouldBePickedByLocale'
import { allBlogPostsWithTranslates } from '../_content'
import { TOC } from '@/components/TOC'
import { PostAuthor } from '@/components/PostAuthor'
import { generateFullUrl } from '@/utils/generateFullUrl'
import { memeberToPostAuthor } from '@/utils/memeberToPostAuthor'
import { formatDate } from '@/utils/formatDate'
import type { Language } from '@/i18n/i18n.settings'
import { Popover } from '@/components/Popover'
import { ShareButton } from '@/components/ShareButton'

interface BlogProps {
  params: {
    slug: string
    locale: Language
  }
}

export async function generateStaticParams() {
  return allBlogPosts.map((post: BlogPost) => ({
    slug: post.slug,
  }))
}

export const generateMetadata = ({ params }: BlogProps): Metadata => {
  const blogPost = allBlogPostsWithTranslates.find(post => post.slug === params.slug && isPostShouldBePickedByLocale(post, params.locale))

  const author = allMemebers.find(memeber => blogPost?.author === memeber.username)

  return {
    title: blogPost?.title,
    description: blogPost?.summary,
    openGraph: {
      title: blogPost?.title,
      description: blogPost?.summary,
      type: 'article',
      section: 'Technology',
      publishedTime: blogPost?.publishedAt,
      authors: author?.fullName,
      locale: blogPost?.lang,
      alternateLocale: Object.keys(blogPost?.translates ?? {}),
      tags: blogPost?.tags,
      url: generateFullUrl(`/${params.locale}/posts/${blogPost?.slug}`),
      images: [generateFullUrl(blogPost?.image)],
    },
    alternates: {
      languages: Object.keys(blogPost?.translates || {}).reduce<{ [key in Language]?: Route }>(
        (acc, postLocale) => ({ ...acc, [postLocale]: `/${postLocale}/posts/${params.slug}` }),
        {},
      ),
    },
  }
}

export default function Post({ params }: BlogProps) {
  const post = allBlogPostsWithTranslates.find(post => post.slug === params.slug && isPostShouldBePickedByLocale(post, params.locale))
  const postAuthor = allMemebers.find(memeber => memeber.username === post?.author)

  if (!post || !postAuthor) {
    notFound()
  }

  const jsonLd: WithContext<BlogPosting> = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    datePublished: post.publishedAt,
    image: generateFullUrl(post.image),
    description: post.summary,
    author: memeberToPostAuthor(postAuthor),
    keywords: post.tags?.join(', '),
  }

  return (
    <article className="px-2 md:px-6" lang={post.lang}>
      <JsonLDScript jsonLD={jsonLd} />
      <main className="grid grid-cols-1 md:grid-cols-[auto_max-content] md:grid-rows-[16rem] md:gap-x-8 lg:gap-x-12 relative">
        <div className="col-start-1 col-span-1 overflow-hidden relative h-32 sm:h-44 md:h-64">
          <Image fill className="object-contain rounded-lg" src={post.image} alt={post.imageDescription || post.title} />
        </div>
        <div className="col-start-1 col-span-1 max-w-full md:max-w-5xl flex flex-col mt-6">
          <div className="col-start-1 col-span-1 max-w-full md:max-w-5xl flex flex-col mt-6">
            <div className="flex justify-between items-center mb-4">
              <p className="text-gray-600 text-sm">{formatDate(post.publishedAt, params.locale)}</p>
              <Popover
                trigger={
                  <ShareButton shareData={{ title: post.title, text: post.summary, url: generateFullUrl(`/${params.locale}/posts/${post.slug}`) }} />
                }
                content={post.lang === 'en' ? 'Copied to clipboard' : 'Ссылка скопирована'}
                useTimer
                useShare
              />
            </div>
          </div>
          <h1 className="font-bold text-3xl mt-6 lg:text-5xl lg:font-extrabold">{post.title}</h1>
          {post.tags ? (
            <div className="my-8">
              <ChipsRow>
                {post.tags.map((tag, index) => (
                  <Chip key={index}>{tag}</Chip>
                ))}
              </ChipsRow>
            </div>
          ) : null}
        </div>
        <aside className="md:col-start-2 md:col-span-1 md:row-span-full md:sticky md:order-2 top-4 h-max mb-6 md:w-60 lg:w-80 space-y-4">
          <PostAuthor
            title={postAuthor.title}
            avatarUrl={`/memebers-avatars/${postAuthor.avatarFileName}`}
            username={postAuthor.username}
            fullName={postAuthor.fullName}
          />
          {/* @ts-expect-error React Server components */}
          <TOC toc={post.toc} locale={params.locale} />
        </aside>
        <div className="md:col-start-1 md:col-span-1 max-w-full md:max-w-5xl">
          <Mdx code={post.body.code} />
        </div>
      </main>
    </article>
  )
}
