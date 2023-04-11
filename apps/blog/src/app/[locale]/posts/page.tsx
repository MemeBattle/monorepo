import Link from 'next/link'
import type { Blog } from 'contentlayer/generated'
import { allBlogs } from 'contentlayer/generated'
import { useTranslation } from '../../../i18n'
import type { Language } from '../../../i18n/i18n.settings'

export async function generateStaticParams() {
  return allBlogs.map((post: Blog) => ({
    slug: post.slug,
  }))
}

export default async function BlogPage({ params: { locale } }: { params: { locale: Language } }) {
  const { t } = await useTranslation(locale, 'posts')

  return (
    <main>
      <h1>{t('title')}</h1>
      {allBlogs
        .sort((a: Blog, b: Blog) => {
          if (new Date(a.publishedAt) > new Date(b.publishedAt)) {
            return -1
          }
          return 1
        })
        .map((post: Blog) => (
          <Link key={post.slug} href={`/${locale}/posts/${post.slug}`}>
            <div>
              <p>{post.title}</p>
            </div>
          </Link>
        ))}
    </main>
  )
}
