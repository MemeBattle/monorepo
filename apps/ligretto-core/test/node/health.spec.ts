// The Node smoke suite: src/entry/node.ts as `pnpm start:dev` runs it, booted by global-setup.ts. It proves the wiring
// (the environment, the database probe, the dispatch of one port to both apps), not behaviour, which the unit and HTTP
// suites cover.
import { describe, expect, inject, it } from 'vitest'

const baseUrl = inject('nodeEntryUrl')

describe('the Node entry', () => {
  it('answers /health with the database check', async () => {
    const res = await fetch(`${baseUrl}/health`)
    const body: unknown = await res.json()
    // The body says why on a 503: the report of the database check.
    expect(res.status, JSON.stringify(body)).toBe(200)
    expect(body).toMatchObject({ status: 'ok' })
  })

  it('answers an unknown route with 404', async () => {
    const res = await fetch(`${baseUrl}/nope`)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })
})
