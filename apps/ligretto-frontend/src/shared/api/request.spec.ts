import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildSearchParams, request } from './request'

describe('buildSearchParams', () => {
  it('repeats array params instead of comma-joining them', () => {
    const params = buildSearchParams({ ids: ['6a932978f77c9c7a7951e541', '6a93297bf77c9cb1a451e542'] })

    expect(params.toString()).toBe('ids=6a932978f77c9c7a7951e541&ids=6a93297bf77c9cb1a451e542')
  })

  it('serializes flat values and skips nullish ones', () => {
    const params = buildSearchParams({ page: 2, search: 'abc', empty: undefined, missing: null })

    expect(params.toString()).toBe('page=2&search=abc')
  })
})

describe('request', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches users with repeated ids params', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) })
    vi.stubGlobal('fetch', fetchMock)

    await request.get('/users', { params: { ids: ['6a932978f77c9c7a7951e541', '6a93297bf77c9cb1a451e542'] } })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/users?ids=6a932978f77c9c7a7951e541&ids=6a93297bf77c9cb1a451e542')
  })
})
