import { act, cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { readReturnTo, ReturnToLink } from './returnTo'

/** A query string with `return_to` set to each value, encoded the way a browser would. */
const query = (...values: string[]) => `?${new URLSearchParams(values.map(value => ['return_to', value])).toString()}`

describe('readReturnTo', () => {
  const { origin } = window.location

  it.each([
    ['the authorization request', '/oidc/authorize?client_id=x&state=a%20b', '/oidc/authorize?client_id=x&state=a%20b'],
    ['a path with a fragment', '/oidc/authorize?x=1#part', '/oidc/authorize?x=1#part'],
    ['a dot segment that stays on this origin, normalized', '/a/../oidc/authorize?x=1', '/oidc/authorize?x=1'],
  ])('accepts %s', (_, value, expected) => {
    const result = readReturnTo(query(value))

    expect(result).toBe(expected)
    expect(new URL(result ?? '', origin).origin).toBe(origin)
  })

  it.each([
    ['no parameter', ''],
    ['an empty value', query('')],
    ['another origin', query('https://evil.example/x')],
    ['this very origin as an absolute URL', query(`${window.location.origin}/oidc/authorize`)],
    ['a protocol-relative URL', query('//evil.example/x')],
    ['a backslash the parser reads as a slash', query('/\\evil.example')],
    ['a tab the parser strips before a second slash', query('/\t/evil.example')],
    ['a dot segment that normalizes to a protocol-relative path', query('/.//evil.example/x')],
    ['a parent segment that normalizes to a protocol-relative path', query('/safe/..//evil.example/x')],
    ['an encoded dot segment that normalizes to a protocol-relative path', query('/%2e//evil.example/x')],
    ['a script URL', query('javascript:alert(1)')],
    ['a relative path', query('oidc/authorize')],
    ['the parameter repeated', query('/oidc/authorize?x=1', '/oidc/authorize?x=2')],
  ])('drops %s', (_, search) => {
    expect(readReturnTo(search)).toBeNull()
  })
})

describe('ReturnToLink', () => {
  afterEach(() => {
    // No `globals` in the vitest config, so testing-library does not unmount on its own.
    cleanup()
  })

  const renderLink = (search: string) => {
    const router = createMemoryRouter(
      [
        { path: '/start', element: <h1>Первый</h1> },
        { path: '/first', element: <ReturnToLink to="/second">Дальше</ReturnToLink> },
        { path: '/second', element: <h1>Второй</h1> },
      ],
      { initialEntries: ['/start', `/first${search}`], initialIndex: 1 },
    )
    render(<RouterProvider router={router} />)
    return router
  }

  it('carries an accepted return_to and replaces the entry', async () => {
    const search = query('/oidc/authorize?client_id=x')
    const router = renderLink(search)

    expect(screen.getByRole('link', { name: 'Дальше' }).getAttribute('href')).toBe(`/second${search}`)

    await userEvent.setup().click(screen.getByRole('link', { name: 'Дальше' }))
    await screen.findByRole('heading', { name: 'Второй' })
    expect(router.state.historyAction).toBe('REPLACE')
    await act(() => router.navigate(-1))
    expect(router.state.location.pathname).toBe('/start')
  })

  it.each([
    ['without return_to', ''],
    ['with another origin', query('https://evil.example/')],
  ])('is a plain link that pushes %s', async (_, search) => {
    const router = renderLink(search)

    expect(screen.getByRole('link', { name: 'Дальше' }).getAttribute('href')).toBe('/second')

    await userEvent.setup().click(screen.getByRole('link', { name: 'Дальше' }))
    await screen.findByRole('heading', { name: 'Второй' })
    expect(router.state.historyAction).toBe('PUSH')
  })
})
