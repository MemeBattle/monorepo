import type { BlogPost } from 'contentlayer/generated'
import { allBlogPosts } from 'contentlayer/generated'
import { useTranslation } from '../../../i18n'
import type { Language } from '../../../i18n/i18n.settings'
import { SearchInput } from '../../../components/SearchInput'
import { PostsList } from '../../../components/PostsList'
import { Suspense } from 'react'
import { formatDate } from '../../../utils/formatDate'
import { TagsSelector } from '../../../components/TagsSelector'
import { ChipsRow } from '../../../components/ChipsRow'
import { Chip } from '../../../components/Chip'
import { EmptyPlaceholder } from '../../../components/PostsList/EmptyPlaceholder'

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

export default async function BlogPage({ params: { locale } }: { params: { locale: Language } }) {
  const { t } = await useTranslation(locale, 'posts')

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
        <Suspense fallback="loading">
          <PostsList
            // @ts-expect-error Async Server Component */
            emptyListPlaceholder={<EmptyPlaceholder language={locale} />}
            locale={locale}
            posts={allBlogPosts
              .sort((a: BlogPost, b: BlogPost) => {
                if (new Date(a.publishedAt) > new Date(b.publishedAt)) {
                  return -1
                }
                return 1
              })
              .map(post => ({ ...post, publishedAt: formatDate(post.publishedAt, locale) }))}
          />
        </Suspense>
      </main>
    </div>
  )
}
