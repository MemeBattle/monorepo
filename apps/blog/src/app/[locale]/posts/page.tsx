import Link from 'next/link'
import type { Metadata } from 'next'

import { allBlogPostsWithTranslates, uniqTags } from './_content'
import { filterBlogPosts } from './_utils/filterBlogPosts'
import { useTranslation } from '@/i18n'
import { SearchInput } from '@/components/SearchInput'
import { Suspense } from 'react'
import { TagsSelector } from '@/components/TagsSelector'
import { ChipsRow } from '@/components/ChipsRow'
import { Chip } from '@/components/Chip'
import { EmptyPlaceholder } from '@/components/PostsList'
import { PostsListItem } from '@/components/PostsListItem'
import { formatDate } from '@/utils/formatDate'
import type { Language } from '@/i18n/i18n.settings'

function SearchLoader() {
  return <div className="rounded-md shadow-sm h-16 border-0 text-gray-900" />
}

function searchParamsSearchFormatter(searchQuery: string | string[] | undefined): string | undefined {
  if (Array.isArray(searchQuery)) {
    return searchQuery.join(' ')
  }
  return searchQuery
}

function searchParamsTagsFormatter(tagsQuery: string | string[] | undefined): string[] | undefined {
  if (typeof tagsQuery === 'string') {
    return [tagsQuery]
  }
  return tagsQuery
}

export async function generateMetadata({ params }: { params: { locale: Language } }): Promise<Metadata> {
  // useTranslation on server isn't react hook
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { t } = await useTranslation(params.locale, 'posts')

  return {
    title: t('title'),
    description: t('description'),
  }
}

export default async function BlogPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: Language }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const { t } = await useTranslation(locale, 'posts')

  const searchQueryTags = searchParamsTagsFormatter(searchParams.tags)
  const searchQuerySearch = searchParamsSearchFormatter(searchParams.search)

  const filteredPosts = filterBlogPosts(allBlogPostsWithTranslates, locale, searchQuerySearch, searchQueryTags)
    .sort((a, b) => {
      if (new Date(a.publishedAt) > new Date(b.publishedAt)) {
        return -1
      }
      return 1
    })
    .map(post => ({ ...post, publishedAt: formatDate(post.publishedAt, locale) }))

  return (
    <div className="container flex flex-col md:flex-row-reverse justify-center px-1">
      <nav className="min-w-md w-full md:w-96 md:ml-8 mb-10">
        <Suspense fallback={<SearchLoader />}>
          <SearchInput placeholder={t('searchPlaceholder')} />
        </Suspense>
        <h1 className="mt-4 mb-2 text-2xl font-black">{t('tagsTitle')}</h1>
        <Suspense
          fallback={
            <ChipsRow>
              {uniqTags.map(tag => (
                <Chip key={tag}>{tag}</Chip>
              ))}
            </ChipsRow>
          }
        >
          <TagsSelector tags={uniqTags} />
        </Suspense>
      </nav>
      <main className="flex flex-col space-y-6 max-w-3xl w-full">
        {filteredPosts.map(post => (
          <Link key={post.slug} href={`/${locale}/posts/${post.slug}`} className="group">
            <PostsListItem
              tags={post.tags?.map(tag => ({ text: tag, isActive: searchQueryTags?.includes(tag) || false }))}
              title={post.title}
              summary={post.summary}
              imageSrc={post.image}
              imageDescription={post.imageDescription}
              publishedAt={post.publishedAt}
            />
          </Link>
        ))}
        {/* @ts-expect-error React Server components */}
        {filteredPosts.length === 0 ? <EmptyPlaceholder language={locale} /> : null}
      </main>
    </div>
  )
}
