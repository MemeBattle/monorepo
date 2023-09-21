import { readFileSync } from 'fs'
import { testAllBlogPosts } from './allBlogPosts.fixture'

vi.mock('contentlayer/generated', () => ({ allBlogPosts: testAllBlogPosts }))

import { GET } from '../route'

const rawFeedXML = readFileSync(__dirname + '/feed.fixture.xml', 'utf8')
const expectedFeedXML = rawFeedXML.trim()
describe('Feed GET hundler', () => {
  it("should return atom xml with blog's posts when a user requests it", async () => {
    const request = new Request(`${process.env.VITE_APP_HOST_URL}/feed/en`)
    const params: { locale: string } = { locale: 'en' }
    const response = await GET(request, { params })

    expect(response.status).toEqual(200)
    expect(await response.text()).toEqual(expectedFeedXML)
  })
})
