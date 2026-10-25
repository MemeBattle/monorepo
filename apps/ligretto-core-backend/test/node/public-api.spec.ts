// The public API on the Node entry: proof that it composes the auth handlers, the users route and the document from
// the development environment. None of these requests needs CAS or a database row: the users route refuses before
// any query, and a logout without a session goes straight back to the application.
import { readFile } from 'node:fs/promises'

import { describe, expect, inject, it } from 'vitest'

const baseUrl = inject('nodeEntryUrl')
const committedDocumentPath = new URL('../../openapi.json', import.meta.url)

describe('the public API on the Node entry', () => {
  it('refuses /api/users without an access token', async () => {
    const res = await fetch(`${baseUrl}/api/users?ids=someone`)
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'unauthorized' })
  })

  it('sends a logout without a session back to the configured application', async () => {
    const res = await fetch(`${baseUrl}/api/auth/logout`, { redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('http://localhost:5174/')
  })

  // The served body is compact and the file pretty-printed, so the comparison is of the parsed documents.
  it('serves the committed public document', async () => {
    const res = await fetch(`${baseUrl}/openapi.json`)
    expect(res.status).toBe(200)
    const committed: unknown = JSON.parse(await readFile(committedDocumentPath, 'utf8'))
    expect(await res.json()).toEqual(committed)
  })
})
