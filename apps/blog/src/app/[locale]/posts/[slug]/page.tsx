import { notFound } from 'next/navigation'
import type { Metadata, Route } from 'next'

import { Mdx } from '../../../../components/Mdx'
import type { BlogPost } from 'contentlayer/generated'
import { allBlogPosts } from 'contentlayer/generated'
import { Chip } from '../../../../components/Chip'
import type { Language } from '../../../../i18n/i18n.settings'
import { ChipsRow } from '../../../../components/ChipsRow'
import { formatDate } from '../../../../utils/formatDate'

import { isPostShouldBePickedByLocale } from '../_utils/isPostShouldBePickedByLocale'
import { allBlogPostsWithTranslates } from '../_content'

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

  return {
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

  if (!post) {
    notFound()
  }

  return (
    <article className="px-2 md:px-6 max-w-full md:max-w-5xl" lang={post.lang}>
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
