// The assets dispatch, on the SPA of the real Build Output (vitest.worker.config.ts): the public host answers the SPA on
// every read the public app does not own, and the internal host never serves an asset, whatever the path.
import { env, exports } from 'cloudflare:workers'
import { beforeAll, describe, expect, it } from 'vitest'

const worker = (exports as unknown as { default: Fetcher }).default
/** The service binding to the `InternalApi` entrypoint, declared in vitest.worker.config.ts. */
const internalBinding = (env as unknown as { INTERNAL: Fetcher }).INTERNAL

const expectJsonNotFound = async (res: Response, error = 'not_found') => {
  expect(res.status).toBe(404)
  expect(res.headers.get('content-type')).toContain('application/json')
  expect(await res.json()).toEqual({ error })
}

describe('the assets dispatch', () => {
  let indexHtml: string
  let scriptPath: string

  beforeAll(async () => {
    const res = await worker.fetch('http://localhost/')
    indexHtml = await res.text()
    const match = /src="(\/assets\/[^"]+\.js)"/.exec(indexHtml)
    if (!match?.[1]) {
      throw new Error('index.html names no hashed script')
    }
    scriptPath = match[1]
  })

  describe('on the public hostname', () => {
    it('answers / with the SPA', async () => {
      const res = await worker.fetch('http://localhost/')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/html')
      expect(await res.text()).toContain('<title>Ligretto</title>')
    })

    it('answers a deep link with the same document', async () => {
      const res = await worker.fetch('http://localhost/game/some-id')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe(indexHtml)
    })

    it('answers HEAD on a deep link', async () => {
      const res = await worker.fetch('http://localhost/game/some-id', { method: 'HEAD' })
      expect(res.status).toBe(200)
    })

    it('serves the hashed script, built to call the API on its own origin', async () => {
      const res = await worker.fetch(`http://localhost${scriptPath}`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('javascript')
      const script = await res.text()
      expect(script).not.toContain('localhost:3333')
      // With an empty base the path stands alone in its string. The opening quote rejects the two other forms: a foreign
      // base's `${base}/api/auth/sign-in`, and the client's status key "GET /api/auth/sign-in". The minifier picks the
      // quote, so the pattern accepts any of them.
      expect(script).toMatch(/[`"']\/api\/auth\/sign-in[`"']/)
    })

    it.each(['/api', '/api/nope'])('never falls back to the SPA in the API namespace: GET %s', async path => {
      await expectJsonNotFound(await worker.fetch(`http://localhost${path}`))
    })

    it('leaves a non-read to the public app', async () => {
      await expectJsonNotFound(await worker.fetch('http://localhost/nope', { method: 'POST' }))
    })
  })

  describe('on the internal hostname', () => {
    it.each(['/', '/index.html', '/game/some-id'])('serves no asset on %s', async path => {
      await expectJsonNotFound(await worker.fetch(`http://internal.localhost${path}`))
    })

    it('does not serve the hashed script', async () => {
      await expectJsonNotFound(await worker.fetch(`http://internal.localhost${scriptPath}`))
    })

    it('serves no asset through the InternalApi service binding', async () => {
      await expectJsonNotFound(await internalBinding.fetch('http://internal.localhost/'))
    })
  })

  it('serves no asset on a foreign hostname', async () => {
    await expectJsonNotFound(await worker.fetch('http://other.example/'), 'unknown_host')
  })
})
