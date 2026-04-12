import { filterBlogPosts } from './filterBlogPosts'

const posts = [
  {
    title: 'Заголовок поста 1',
    publishedAt: '2023-05-28T00:00:00.000Z',
    summary: 'Первый пост в блоге',
    tags: ['тэг1'],
    image: '/content-images/what-is-memebattle/memeBattle-logo.svg',
    rawBody: 'раз два три',
    slug: 'first',
    toc: [
      {
        level: 2,
        value: 'text',
        slug: 'text',
      },
    ],
    lang: 'ru' as const,
    translates: {},
    author: 'authorNickName',
    importPath: 'first.ru',
  },
  {
    title: 'Заголовок поста 2',
    publishedAt: '2023-05-28T00:00:00.000Z',
    summary: 'Тезисное содержание поста 2',
    tags: [],
    image: '/content-images/what-is-memebattle/memeBattle-logo.svg',
    rawBody: 'какой-то текст',
    slug: 'some-id',
    toc: [
      {
        level: 2,
        value: 'text',
        slug: 'text',
      },
    ],
    lang: 'ru' as const,
    translates: {},
    author: 'authorNickName',
    importPath: 'some-id.ru',
  },
  {
    title: 'First post title',
    publishedAt: '2023-05-28T00:00:00.000Z',
    summary: 'First blog post',
    tags: ['tag1'],
    image: '/content-images/what-is-memebattle/memeBattle-logo.svg',
    rawBody: 'one two three',
    slug: 'first',
    toc: [
      {
        level: 2,
        value: 'text',
        slug: 'text',
      },
    ],
    lang: 'en' as const,
    translates: {},
    author: 'authorNickName',
    importPath: 'first.en',
  },
]

posts[0].translates = { en: posts[2] }
posts[2].translates = { ru: posts[1] }

describe('filterBlogPosts', () => {
  it('Should return all (uniq by locale) posts if search and tags empty', () => {
    expect(filterBlogPosts(posts, 'ru')).toEqual([posts[0], posts[1]])
  })

  it("Should return empty posts if posts doesn't contain words from search", () => {
    expect(filterBlogPosts(posts, 'ru', 'some query')).toEqual([])
  })

  it('Should return filtered post that contains words from search', () => {
    expect(filterBlogPosts(posts, 'ru', 'раз')).toEqual([posts[0]])
  })

  it('Should return filtered post that contains words from search', () => {
    expect(filterBlogPosts(posts, 'ru', 'раз')).toEqual([posts[0]])
  })
})
