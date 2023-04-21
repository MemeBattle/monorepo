import type { BlogPost } from 'contentlayer/generated'
import { allBlogPosts } from 'contentlayer/generated'
import Link from 'next/link'
import { useTranslation } from '../../../i18n'
import type { Language } from '../../../i18n/i18n.settings'
import { SearchInput } from '../../../components/SearchInput'
import { Suspense } from 'react'
import { formatDate } from '../../../utils/formatDate'
import { TagsSelector } from '../../../components/TagsSelector'
import { ChipsRow } from '../../../components/ChipsRow'
import { Chip } from '../../../components/Chip'
import { EmptyPlaceholder } from '../../../components/PostsList/EmptyPlaceholder'
import { PostsListItem } from '../../../components/PostsListItem'

function SearchLoader() {
  return <div className="rounded-md shadow-sm h-16 border-0 text-gray-900" />
}

const uniqTags = [
  ...allBlogPosts.reduce<Set<string>>((acc, { tags = [] }) => {
    tags.forEach(tag => {
      acc.add(tag)
    })
    return acc
  }, new Set<string>()),
]

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

  const filteredPosts = filterBlogPosts(allBlogPosts, searchQuerySearch, searchQueryTags)
    .sort((a: BlogPost, b: BlogPost) => {
      if (new Date(a.publishedAt) > new Date(b.publishedAt)) {
        return -1
      }
      return 1
    })
    .map(post => ({ ...post, publishedAt: formatDate(post.publishedAt, locale) }))

  return (
    <div className="container flex flex-col md:flex-row-reverse justify-center pt-10 px-1">
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
        {filteredPosts.map((post: BlogPost) => (
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
