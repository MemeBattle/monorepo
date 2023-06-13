import type { LocalesBySlug } from './isPostShouldBePickedByLocale'
import { filterBlogPosts } from './filterBlogPosts'
import type { BlogPost } from 'contentlayer/generated'

const posts: BlogPost[] = [
  {
    title: 'Заголовок поста 1',
    publishedAt: '2023-05-28T00:00:00.000Z',
    summary: 'Первый пост в блоге',
    tags: ['тэг1'],
    image: '/content-images/what-is-memebattle/memeBattle-logo.svg',
    body: {
      raw: 'раз два три',
      code: '',
    },
    _id: 'first.ru.mdx',
    _raw: {
      sourceFilePath: 'first.ru.mdx',
      sourceFileName: 'first.ru.mdx',
      sourceFileDir: '.',
      contentType: 'mdx',
      flattenedPath: 'first.ru',
    },
    type: 'BlogPost',
    slug: 'first',
    toc: [
      {
        level: 'h1',
        text: 'text',
      },
    ],
    lang: 'ru',
  },
  {
    title: 'Заголовок поста 2',
    publishedAt: '2023-05-28T00:00:00.000Z',
    summary: 'Тезисное содержание поста 2',
    tags: [],
    image: '/content-images/what-is-memebattle/memeBattle-logo.svg',
    body: {
      raw: 'какой-то текст',
      code: '',
    },
    _id: 'some-id.mdx',
    _raw: {
      sourceFilePath: 'some-id.mdx',
      sourceFileName: 'some-id.mdx',
      sourceFileDir: '.',
      contentType: 'mdx',
      flattenedPath: 'some-id',
    },
    type: 'BlogPost',
    slug: 'some-id',
    toc: [
      {
        level: 'h1',
        text: 'text',
      },
    ],
    lang: 'ru',
  },
  {
    title: 'First post title',
    publishedAt: '2023-05-28T00:00:00.000Z',
    summary: 'First blog post',
    tags: ['tag1'],
    image: '/content-images/what-is-memebattle/memeBattle-logo.svg',
    body: {
      raw: 'one two three',
      code: '',
    },
    _id: 'first.en.mdx',
    _raw: {
      sourceFilePath: 'first.en.mdx',
      sourceFileName: 'first.en.mdx',
      sourceFileDir: '.',
      contentType: 'mdx',
      flattenedPath: 'first.en',
    },
    type: 'BlogPost',
    slug: 'first',
    toc: [
      {
        level: 'h1',
        text: 'text',
      },
    ],
    lang: 'en',
  },
]

const localesBySlug: LocalesBySlug = new Map([
  ['first', new Set(['en', 'ru'])],
  ['some-id', new Set(['ru'])],
])

describe('filterBlogPosts', () => {
  it('Should return all (uniq by locale) posts if search and tags empty', () => {
    expect(filterBlogPosts(posts, localesBySlug, 'ru')).toEqual([posts[0], posts[1]])
  })

  it("Should return empty posts if posts doesn't contain words from search", () => {
    expect(filterBlogPosts(posts, localesBySlug, 'ru', 'some query')).toEqual([])
  })

  it('Should return filtered post that contains words from search', () => {
    expect(filterBlogPosts(posts, localesBySlug, 'ru', 'раз')).toEqual([posts[0]])
  })

  it('Should return filtered post that contains words from search', () => {
    expect(filterBlogPosts(posts, localesBySlug, 'ru', 'раз')).toEqual([posts[0]])
  })
})
