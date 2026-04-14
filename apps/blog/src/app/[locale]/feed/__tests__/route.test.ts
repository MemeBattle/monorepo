import { GET } from '../route'
import type { Language } from '@/i18n/i18n.settings'
import { readFileSync } from 'fs'

vi.mock('@/content/blog-posts', () => ({
  getAllBlogPosts: vi.fn().mockResolvedValue([
    {
      title: 'What is MemeBattle?',
      publishedAt: '2023-05-28T00:00:00.000Z',
      summary: "Post about MemeBattle. How it's started and what is MemeBattle today",
      author: 'themezv',
      slug: 'what-is-memebattle',
      lang: 'en',
      toc: [],
      rawBody: '',
      fileName: 'what-is-memebattle.en',
    },
  ]),
}))

const rawFeedXML = readFileSync(__dirname + '/feed.fixture.xml', 'utf8')
const expectedFeedXML = rawFeedXML.trim()
describe('Feed GET hundler', () => {
  it("should return atom xml with blog's posts when a user requests it", async () => {
    const request = new Request(`${process.env.APP_HOST_URL}/en/feed`)
    const params: Promise<{ locale: Language }> = Promise.resolve({ locale: 'en' })
    const response = await GET(request, { params })

    expect(response.status).toEqual(200)
    expect(await response.text()).toEqual(expectedFeedXML)
  })
})
