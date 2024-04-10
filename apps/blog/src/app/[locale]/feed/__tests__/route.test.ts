import { readFileSync } from 'fs'

import { GET } from '../route'
import type { Language } from '@/i18n/i18n.settings'

vi.mock('contentlayer/generated', () => ({ allBlogPosts: [JSON.parse(readFileSync(__dirname + '/testPost.fixture.json', 'utf8'))] }))

const rawFeedXML = readFileSync(__dirname + '/feed.fixture.xml', 'utf8')
const expectedFeedXML = rawFeedXML.trim()
describe('Feed GET hundler', () => {
  it("should return atom xml with blog's posts when a user requests it", async () => {
    const request = new Request(`${process.env.APP_HOST_URL}/en/feed`)
    const params: { locale: Language } = { locale: 'en' }
    const response = await GET(request, { params })

    expect(response.status).toEqual(200)
    expect(await response.text()).toEqual(expectedFeedXML)
  })
})
