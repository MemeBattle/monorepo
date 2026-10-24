/**
 * The CORS policy as the browser sees it. `#helpers/allowedOrigin` is covered on its own in the unit suite; these
 * cases pin that it is the predicate `config/cors.ts` wires in, and that its answer comes with
 * `access-control-allow-credentials` — the pair that decides whether a foreign origin can read a response carrying
 * the session cookie.
 */

import { test } from '@japa/runner'

test.group('CORS', () => {
  test('a development frontend origin — echoed back, with credentials allowed', async ({ client, assert }) => {
    const response = await client.get('/api/').header('Origin', 'http://localhost:5173')

    response.assertStatus(200)
    assert.equal(response.headers()['access-control-allow-origin'], 'http://localhost:5173')
    assert.equal(response.headers()['access-control-allow-credentials'], 'true')
  })

  test('a host that merely starts with localhost — neither header', async ({ client, assert }) => {
    const response = await client.get('/api/').header('Origin', 'http://localhost.attacker.example')

    assert.isUndefined(response.headers()['access-control-allow-origin'])
    assert.isUndefined(response.headers()['access-control-allow-credentials'])
  })
})
