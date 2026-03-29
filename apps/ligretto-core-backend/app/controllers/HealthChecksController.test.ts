import { test } from '@japa/runner'

test.group('GET /health', () => {
  test('returns 200 when healthy', async ({ client }) => {
    const response = await client.get('/health')
    response.assertStatus(200)
  })
})
