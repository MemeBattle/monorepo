import { notFound } from 'next/navigation'
import type { Metadata, Route } from 'next'
import type { WithContext, BlogPosting } from 'schema-dts'

import { Mdx } from '../../../../components/Mdx'
import type { BlogPost } from 'contentlayer/generated'
import { allBlogPosts, allMemebers } from 'contentlayer/generated'
import { Chip } from '../../../../components/Chip'
import { JsonLDScript } from '../../../../components/JsonLDScript'
import type { Language } from '../../../../i18n/i18n.settings'
import { ChipsRow } from '../../../../components/ChipsRow'
import { formatDate } from '../../../../utils/formatDate'

import { isPostShouldBePickedByLocale } from '../_utils/isPostShouldBePickedByLocale'
import { allBlogPostsWithTranslates } from '../_content'
import { generateFullUrl } from '../../../../utils/generateFullUrl'
import { memeberToPostAuthor } from '../../../../utils/memeberToPostAuthor'

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
    <article className="px-2 md:px-6 max-w-full md:max-w-5xl" lang={post.lang}>
      <JsonLDScript jsonLD={jsonLd} />
      <p className="text-gray-600 text-sm">{formatDate(post.publishedAt, params.locale)}</p>
      <h1 className="font-bold text-3xl my-6 lg:text-5xl lg:font-extrabold">{post.title}</h1>
      {post.tags ? (
        <div className="my-6">
          <ChipsRow>
            {post.tags.map((tag, index) => (
              <Chip key={index}>{tag}</Chip>
            ))}
          </ChipsRow>
        </div>
      ) : null}
      <Mdx code={post.body.code} />
    </article>
  )
}
