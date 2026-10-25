// The internal token is wired on the Node entry: the internal app, mounted under /internal on the same port, refuses
// a request without the token and accepts the configured one. An accepted token is shown without a migrated
// database: a save-round with an empty body is refused by the request validator, which runs after the guard and
// before any query. The PGlite HTTP suite covers the routes' behaviour.
import { describe, expect, inject, it } from 'vitest'

const baseUrl = inject('nodeEntryUrl')

/**
 * The token of the repository root .env.development, public by construction, which the entry loads. A shell that
 * exports another LIGRETTO_INTERNAL_API_TOKEN overrides the file and fails the accepted-token case on purpose.
 */
const DEV_TOKEN = 'dev-only-internal-api-token-public-by-construction'

describe('the internal token on the Node entry', () => {
  it('refuses POST /internal/games without it', async () => {
    const res = await fetch(`${baseUrl}/internal/games`, { method: 'POST' })
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'invalid_internal_token' })
  })

  it('accepts the configured token', async () => {
    const res = await fetch(`${baseUrl}/internal/games/${crypto.randomUUID()}/rounds`, {
      method: 'POST',
      headers: { authorization: `Bearer ${DEV_TOKEN}`, 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'validation_failed' })
  })
})
