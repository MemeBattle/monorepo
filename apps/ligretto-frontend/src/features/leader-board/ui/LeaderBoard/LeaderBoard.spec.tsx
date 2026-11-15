// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { Provider } from 'react-redux'
import { ThemeProvider } from '@memebattle/ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { theme } from '#app/themes/default'
import { authInitialState } from '#ducks/auth/authSlice'
import { createQueryClient } from '#shared/api'
import type { Leader, Leaderboard, LeadersPeriod } from '#shared/api'
import { createMockStore } from '#testing/lib/createMockStore'

import { LeaderBoard } from './LeaderBoard'

const ERROR_TEXT = 'Could not load the leaders.'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const leader = (sub: string, name: string | null, totalPoints: number, place: number): Leader => ({ sub, name, avatarUrl: null, totalPoints, place })

const board = (leaders: Leader[], me: Leader | null = null): Leaderboard => ({ leaders, me })

const unauthorized = () => json({ error: 'unauthorized' }, 401)

/** A response the test resolves when it chooses, to hold a request in flight. */
const deferred = () => {
  let resolve: (response: Response) => void = () => {}
  const promise = new Promise<Response>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

type Reply = () => Response | Promise<Response>

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
let queryClient: QueryClient
let replies: Record<LeadersPeriod, Reply[]>

const reply = (period: LeadersPeriod, ...next: Reply[]) => {
  replies[period].push(...next)
}

const requestUrl = (input: Parameters<typeof fetch>[0]) => new URL(input instanceof Request ? input.url : String(input), 'http://localhost')

const requestedPeriods = () => fetchMock.mock.calls.map(([input]) => requestUrl(input).searchParams.get('period'))

const rows = () => document.querySelectorAll('[data-test-id="LeaderBoard-Row"]')

const renderBoard = () => {
  const store = createMockStore({
    preloadedState: { auth: { ...authInitialState, userId: 'me', accessToken: 'token-1', isBootstrapped: true, accountType: 'full' } },
  })
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <LeaderBoard />
        </ThemeProvider>
      </QueryClientProvider>
    </Provider>,
  )
}

const openTab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }))

const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 0)))

beforeEach(() => {
  replies = { day: [], month: [], all: [] }
  fetchMock = vi.fn<typeof fetch>(async input => {
    const period = requestUrl(input).searchParams.get('period') as LeadersPeriod
    const next = replies[period].shift()
    if (!next) {
      throw new Error(`No reply for period ${period}`)
    }
    return next()
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  queryClient = createQueryClient()
})

afterEach(() => {
  queryClient.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('LeaderBoard', () => {
  it('fetches the day ranking only, shows the medal places, and gives tied players the same medal', async () => {
    reply('day', () =>
      json(
        board([
          leader('a', 'Ann', 100, 1),
          leader('b', 'Bob', 90, 2),
          leader('c', null, 90, 2),
          leader('e', 'Eve', 80, 3),
          leader('d', 'Dan', 50, 5),
        ]),
      ),
    )
    renderBoard()

    expect(screen.getByLabelText('Loading leaders')).toBeTruthy()
    expect(await screen.findByText('Ann')).toBeTruthy()

    expect(screen.getAllByAltText('Place 1')).toHaveLength(1)
    expect(screen.getAllByAltText('Place 2')).toHaveLength(2)
    expect(screen.getAllByAltText('Place 3')).toHaveLength(1)
    expect(screen.queryByText('Dan')).toBeNull()
    expect(rows()).toHaveLength(4)
    expect(screen.getByTitle('Player')).toBeTruthy()
    expect(screen.queryByLabelText('Loading leaders')).toBeNull()

    expect(requestedPeriods()).toEqual(['day'])
    const [, init] = fetchMock.mock.calls[0]
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer token-1')
  })

  it('shows the own row under the list when it ranks outside it', async () => {
    reply('day', () => json(board([leader('a', 'Ann', 100, 1), leader('b', 'Bob', 90, 2)], leader('me', 'Me', 3, 150))))
    renderBoard()

    expect(await screen.findByText('Ann')).toBeTruthy()

    expect(screen.getAllByTitle('Me')).toHaveLength(1)
    expect(screen.getByText('150')).toBeTruthy()
    const allRows = rows()
    expect(allRows).toHaveLength(3)
    expect(allRows[2].textContent).toContain('Me')
  })

  it('shows the own row under the medal places when it is in the list below them', async () => {
    const me = leader('me', 'Me', 40, 5)
    reply('day', () =>
      json(board([leader('a', 'Ann', 100, 1), leader('b', 'Bob', 90, 2), leader('c', 'Cid', 80, 3), leader('d', 'Dan', 50, 4), me], me)),
    )
    renderBoard()

    expect(await screen.findByText('Ann')).toBeTruthy()

    expect(screen.queryByText('Dan')).toBeNull()
    expect(screen.getAllByTitle('Me')).toHaveLength(1)
    const allRows = rows()
    expect(allRows).toHaveLength(4)
    expect(allRows[3].textContent).toContain('5')
  })

  it('does not repeat the own row when it is in the list', async () => {
    reply('day', () => json(board([leader('a', 'Ann', 100, 1), leader('me', 'Me', 90, 2)], leader('me', 'Me', 90, 2))))
    renderBoard()

    expect(await screen.findByText('Ann')).toBeTruthy()

    expect(screen.getAllByTitle('Me')).toHaveLength(1)
    expect(rows()).toHaveLength(2)
  })

  it('shows no own row for a guest', async () => {
    reply('day', () => json(board([leader('a', 'Ann', 100, 1), leader('b', 'Bob', 90, 2)], null)))
    renderBoard()

    expect(await screen.findByText('Ann')).toBeTruthy()

    expect(rows()).toHaveLength(2)
  })

  it('shows an empty state when nobody has points in the period', async () => {
    reply('day', () => json(board([], null)))
    renderBoard()

    expect(await screen.findByText('No points in this period yet.')).toBeTruthy()
    expect(rows()).toHaveLength(0)
  })

  it('shows a failure once, logs it without the body, and fetches again on retry', async () => {
    reply('day', unauthorized, () => json(board([leader('a', 'Ann', 100, 1)])))
    renderBoard()

    expect(await screen.findByText(ERROR_TEXT)).toBeTruthy()
    expect(requestedPeriods()).toEqual(['day'])
    expect(console.error).toHaveBeenCalledWith('GET /api/leaders failed', { kind: 'error', status: 401, error: 'unauthorized' })

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Ann')).toBeTruthy()
    expect(screen.queryByText(ERROR_TEXT)).toBeNull()
    expect(requestedPeriods()).toEqual(['day', 'day'])
  })

  it('loads a period not visited yet after the current one failed', async () => {
    reply('day', unauthorized)
    reply('month', () => json(board([leader('m', 'Mona', 500, 1)])))
    renderBoard()

    expect(await screen.findByText(ERROR_TEXT)).toBeTruthy()

    openTab('For month')

    expect(await screen.findByText('Mona')).toBeTruthy()
    expect(screen.queryByText(ERROR_TEXT)).toBeNull()
    expect(requestedPeriods()).toEqual(['day', 'month'])
  })

  it('shows a period that fails after a tab change as failed, and fetches it again on the next visit', async () => {
    const monthAgain = deferred()
    reply('day', () => json(board([leader('a', 'Ann', 100, 1)])))
    reply('month', unauthorized, () => monthAgain.promise)
    renderBoard()
    expect(await screen.findByText('Ann')).toBeTruthy()

    openTab('For month')

    expect(await screen.findByText(ERROR_TEXT)).toBeTruthy()
    await settle()
    expect(screen.getByText(ERROR_TEXT)).toBeTruthy()
    expect(requestedPeriods()).toEqual(['day', 'month'])

    openTab('For day')

    expect(await screen.findByText('Ann')).toBeTruthy()
    expect(screen.queryByText(ERROR_TEXT)).toBeNull()
    expect(requestedPeriods()).toEqual(['day', 'month'])

    openTab('For month')

    await settle()
    expect(screen.getByText('Ann')).toBeTruthy()
    expect(screen.queryByText(ERROR_TEXT)).toBeNull()
    expect(screen.queryByLabelText('Loading leaders')).toBeNull()
    expect(requestedPeriods()).toEqual(['day', 'month', 'month'])

    await act(async () => monthAgain.resolve(json(board([leader('m', 'Mona', 500, 1)]))))

    expect(await screen.findByText('Mona')).toBeTruthy()
  })

  it('keeps the current list on screen while the next tab loads', async () => {
    const month = deferred()
    reply('day', () => json(board([leader('a', 'Ann', 100, 1)])))
    reply('month', () => month.promise)
    renderBoard()
    expect(await screen.findByText('Ann')).toBeTruthy()

    openTab('For month')

    await settle()
    expect(screen.getByText('Ann')).toBeTruthy()
    expect(screen.getByRole('tabpanel').querySelector('[aria-busy="true"]')).toBeTruthy()
    expect(screen.queryByLabelText('Loading leaders')).toBeNull()

    await act(async () => month.resolve(json(board([leader('m', 'Mona', 500, 1)]))))

    expect(await screen.findByText('Mona')).toBeTruthy()
    expect(screen.queryByText('Ann')).toBeNull()
    expect(requestedPeriods()).toEqual(['day', 'month'])

    openTab('For day')

    expect(await screen.findByText('Ann')).toBeTruthy()
    expect(requestedPeriods()).toEqual(['day', 'month'])
  })
})
