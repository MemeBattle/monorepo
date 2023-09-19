import { readFileSync } from 'fs'

import { testAllBlogPosts } from './allBlogPosts.fixture'
import { GET } from '../route'

vi.mock('contentlayer/generated', () => ({ allBlogPosts: testAllBlogPosts }))

const rawFeedXML = readFileSync(__dirname + '/feed.fixture.xml', 'utf8')
const expectedFeedXML = rawFeedXML.trim()

it('should return the expected response', async () => {
  const request = new Request(`${process.env.VITE_APP_HOST_URL}/feed/en`)
  const params: { locale: string } = { locale: 'en' }
  const response = await GET(request, { params })

  expect(response.status).toEqual(200)
  expect(await response.text()).toEqual(expectedFeedXML)
})
