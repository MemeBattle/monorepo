import { filterBlogPosts } from './filterBlogPosts'

const posts = [
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
    type: 'BlogPost',
    slug: 'first',
    toc: [
      {
        level: 'h1',
        text: 'text',
      },
    ],
    lang: 'ru' as const,
    translates: {},
    author: 'authorNickName',
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
    type: 'BlogPost',
    slug: 'some-id',
    toc: [
      {
        level: 'h1',
        text: 'text',
      },
    ],
    lang: 'ru' as const,
    translates: {},
    author: 'authorNickName',
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
    type: 'BlogPost',
    slug: 'first',
    toc: [
      {
        level: 'h1',
        text: 'text',
      },
    ],
    lang: 'en' as const,
    translates: {},
    author: 'authorNickName',
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
