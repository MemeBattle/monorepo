import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createClient, type SaveRoundRequest } from '@memebattle/ligretto-core-client/internal'

import { createIOC } from '../../../inversify.config'
import { IOC_TYPES } from '../../../IOC_TYPES'
import { CORE_REQUEST_TIMEOUT_MS, SAVE_ROUND_RETRY_DELAYS_MS } from '../../../config'
import type { LigrettoCoreService, SaveRoundOutcome } from '..'

const gameId = '6f1c1c9e-3a4b-4c5d-8e9f-0a1b2c3d4e5f'
const round: SaveRoundRequest = {
  roundId: '0b6c1d2e-3f40-4152-8637-48495a6b7c8d',
  results: [
    { playerId: 'host', score: 3 },
    { playerId: 'peer', score: -2 },
  ],
}
const gameResults = { host: { roundScore: 3, gameScore: 3 }, peer: { roundScore: -2, gameScore: -2 } }

interface SentRequest {
  url: string
  method: string
  headers: Headers
  body: string | undefined
  signal: AbortSignal | undefined
}

type Answer = (init: RequestInit) => Response | Promise<Response>

const json =
  (status: number, body: unknown, requestId = `req-${status}`): Answer =>
  () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-request-id': requestId } })

const text =
  (status: number, body: string, headers: Record<string, string> = {}): Answer =>
  () =>
    new Response(body, { status, headers: { 'x-request-id': `req-${status}`, ...headers } })

const reject =
  (message: string): Answer =>
  () =>
    Promise.reject(new TypeError(message))

/** Never answers: rejects with the abort reason, as Node's fetch does while waiting for the headers. */
const stallHeaders: Answer = ({ signal }) =>
  new Promise((_, rejectWith) => {
    signal?.addEventListener('abort', () => rejectWith(signal.reason), { once: true })
  })

/** Answers a declared 200 at once, then never sends the body: the stream errors with the abort reason. */
const stallBody: Answer = ({ signal }) =>
  new Response(
    new ReadableStream({
      start(controller) {
        signal?.addEventListener('abort', () => controller.error(signal.reason), { once: true })
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )

describe('LigrettoCoreService', () => {
  let service: LigrettoCoreService
  let sent: SentRequest[]
  let answers: Answer[]
  let fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>
  let error: MockInstance<typeof console.error>
  let warn: MockInstance<typeof console.warn>

  const answer = (...next: Answer[]) => answers.push(...next)
  const logged = (spy: MockInstance) => spy.mock.calls.map(([message, fields]) => ({ message, fields }))
  const deadlineMessage = `ligretto-core did not answer within ${CORE_REQUEST_TIMEOUT_MS} ms`

  beforeEach(() => {
    vi.useFakeTimers()
    sent = []
    answers = []
    fetch = vi.fn<typeof globalThis.fetch>(async (input, init = {}) => {
      sent.push({
        url: String(input),
        method: init.method ?? 'GET',
        headers: new Headers(init.headers),
        body: typeof init.body === 'string' ? init.body : undefined,
        signal: init.signal ?? undefined,
      })
      const next = answers.shift()
      if (!next) {
        throw new Error('no scripted answer')
      }
      return next(init)
    })
    const container = createIOC()
    container
      .rebind(IOC_TYPES.LigrettoCoreClient)
      .toConstantValue(createClient({ baseUrl: 'http://core.test', fetch, headers: { authorization: 'Bearer test-token' } }))
    service = container.get(IOC_TYPES.LigrettoCoreService)
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    const everything = JSON.stringify([...error.mock.calls, ...warn.mock.calls], (_key, value: unknown) =>
      value instanceof Error ? value.message : value,
    )
    expect(everything).not.toContain('test-token')
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('createGame', () => {
    it('answers the id of a 201', async () => {
      answer(json(201, { id: gameId }))

      expect(await service.createGame()).toEqual({ ok: true, gameId })
      expect(sent).toHaveLength(1)
      expect(sent[0].method).toBe('POST')
      expect(sent[0].url).toBe('http://core.test/internal/games')
      expect(sent[0].headers.get('authorization')).toBe('Bearer test-token')
      expect(error).not.toHaveBeenCalled()
    })

    it('reports a 401 with its code and request id', async () => {
      answer(json(401, { error: 'invalid_internal_token' }, 'req-create-401'))

      expect(await service.createGame()).toEqual({ ok: false })
      expect(logged(error)).toEqual([
        {
          message: 'ligretto-core createGame failed',
          fields: expect.objectContaining({
            operation: 'createGame',
            kind: 'error',
            status: 401,
            error: 'invalid_internal_token',
            requestId: 'req-create-401',
          }),
        },
      ])
    })

    it('reports a rejected fetch as a transport failure', async () => {
      answer(reject('connect ECONNREFUSED'))

      expect(await service.createGame()).toEqual({ ok: false })
      expect(logged(error)[0].fields).toEqual(expect.objectContaining({ kind: 'transport', cause: 'connect ECONNREFUSED' }))
    })

    it('reports an undeclared 500 as unexpected', async () => {
      answer(json(500, { error: 'internal_error' }))

      expect(await service.createGame()).toEqual({ ok: false })
      expect(logged(error)[0].fields).toEqual(expect.objectContaining({ kind: 'unexpected', status: 500, requestId: 'req-500' }))
    })

    it('gives up at the deadline when the headers never come', async () => {
      answer(stallHeaders)
      let settled: unknown
      const creating = service.createGame().then(outcome => (settled = outcome))

      await vi.advanceTimersByTimeAsync(CORE_REQUEST_TIMEOUT_MS - 1)
      expect(settled).toBeUndefined()

      await vi.advanceTimersByTimeAsync(1)
      expect(await creating).toEqual({ ok: false })
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(logged(error)[0].fields).toEqual(expect.objectContaining({ kind: 'transport', cause: deadlineMessage }))
    })
  })

  describe('saveRound', () => {
    const notRecorded = () => logged(error).filter(({ message }) => String(message).includes('round not recorded'))

    it('answers the totals of a 200 and sends the round as given', async () => {
      answer(json(200, { gameResults }))

      expect(await service.saveRound(gameId, round)).toEqual({ ok: true, gameResults })
      expect(sent).toHaveLength(1)
      expect(sent[0].method).toBe('POST')
      expect(sent[0].url).toBe(`http://core.test/internal/games/${gameId}/rounds`)
      expect(sent[0].headers.get('authorization')).toBe('Bearer test-token')
      expect(JSON.parse(sent[0].body!)).toEqual(round)
      expect(error).not.toHaveBeenCalled()
    })

    it.each([
      [404, { error: 'game_not_found' }, 'game_not_found'],
      [409, { error: 'round_conflict' }, 'round_conflict'],
      [400, { error: 'validation_failed' }, 'validation_failed'],
      [422, { error: 'unknown_players', playerIds: ['peer'] }, 'unknown_players'],
    ] as const)('reports a declared %i after one attempt', async (status, body, code) => {
      answer(json(status, body))

      expect(await service.saveRound(gameId, round)).toEqual({ ok: false, error: code })
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(warn).not.toHaveBeenCalled()
      expect(notRecorded()).toEqual([
        {
          message: expect.any(String),
          fields: expect.objectContaining({
            operation: 'saveRound',
            gameId,
            roundId: round.roundId,
            kind: 'error',
            status,
            error: code,
            requestId: `req-${status}`,
            outcome: code,
            results: round.results,
          }),
        },
      ])
      if (status === 422) {
        expect(notRecorded()[0].fields).toEqual(expect.objectContaining({ playerIds: ['peer'] }))
      }
      if (status === 409) {
        expect(notRecorded()[0].message).toContain('bug')
      }
    })

    it('reports a 401 as core_unavailable after one attempt and keeps its code in the log', async () => {
      answer(json(401, { error: 'invalid_internal_token' }))

      expect(await service.saveRound(gameId, round)).toEqual({ ok: false, error: 'core_unavailable' })
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(notRecorded()[0].fields).toEqual(
        expect.objectContaining({
          status: 401,
          error: 'invalid_internal_token',
          outcome: 'core_unavailable',
          roundId: round.roundId,
          results: round.results,
        }),
      )
    })

    it.each([
      ['a redirect', text(302, '', { location: 'http://elsewhere.test/' }), 'redirect', 302],
      ['an undeclared 404 with a text body', text(404, 'Not Found'), 'unexpected', 404],
    ] as const)('reports %s as core_unavailable after one attempt', async (_label, reply, kind, status) => {
      answer(reply)

      expect(await service.saveRound(gameId, round)).toEqual({ ok: false, error: 'core_unavailable' })
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(notRecorded()[0].fields).toEqual(expect.objectContaining({ kind, status, roundId: round.roundId, results: round.results }))
    })

    it('retries a rejected fetch with the identical body', async () => {
      answer(reject('socket hang up'), json(200, { gameResults }))

      const saving = service.saveRound(gameId, round)
      await vi.advanceTimersByTimeAsync(SAVE_ROUND_RETRY_DELAYS_MS[0])

      expect(await saving).toEqual({ ok: true, gameResults })
      expect(sent).toHaveLength(2)
      expect(sent[1].body).toBe(sent[0].body)
      expect(JSON.parse(sent[1].body!).roundId).toBe(round.roundId)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(error).not.toHaveBeenCalled()
    })

    it('gives up after three undeclared 503s, waiting the configured delays between them', async () => {
      answer(json(503, {}, 'req-a'), json(503, {}, 'req-b'), json(503, {}, 'req-c'))
      let outcome: SaveRoundOutcome | undefined
      const saving = service.saveRound(gameId, round).then(settled => (outcome = settled))

      await vi.advanceTimersByTimeAsync(0)
      expect(fetch).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(SAVE_ROUND_RETRY_DELAYS_MS[0] - 1)
      expect(fetch).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(fetch).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(SAVE_ROUND_RETRY_DELAYS_MS[1] - 1)
      expect(fetch).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(1)
      await saving

      expect(outcome).toEqual({ ok: false, error: 'core_unavailable' })
      expect(fetch).toHaveBeenCalledTimes(3)
      expect(new Set(sent.map(({ body }) => body)).size).toBe(1)
      expect(warn).toHaveBeenCalledTimes(2)
      expect(notRecorded()).toHaveLength(1)
      expect(notRecorded()[0].fields).toEqual(expect.objectContaining({ kind: 'unexpected', status: 503, requestId: 'req-c', attempt: 3 }))
    })

    it('ends a stalled body at the deadline and retries with a new signal', async () => {
      answer(stallBody, json(200, { gameResults }))
      const saving = service.saveRound(gameId, round)

      await vi.advanceTimersByTimeAsync(CORE_REQUEST_TIMEOUT_MS)
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(logged(warn)[0].fields).toEqual(expect.objectContaining({ kind: 'transport', cause: deadlineMessage }))

      await vi.advanceTimersByTimeAsync(SAVE_ROUND_RETRY_DELAYS_MS[0])
      expect(await saving).toEqual({ ok: true, gameResults })
      expect(sent).toHaveLength(2)
      expect(sent[1].body).toBe(sent[0].body)
      expect(sent[0].signal).toBeDefined()
      expect(sent[1].signal).not.toBe(sent[0].signal)
    })

    it('settles at the stated worst case when every attempt stalls', async () => {
      answer(stallHeaders, stallHeaders, stallHeaders)
      const worstCase = 3 * CORE_REQUEST_TIMEOUT_MS + SAVE_ROUND_RETRY_DELAYS_MS[0] + SAVE_ROUND_RETRY_DELAYS_MS[1]
      expect(worstCase).toBe(13_000)
      let outcome: SaveRoundOutcome | undefined
      const saving = service.saveRound(gameId, round).then(settled => (outcome = settled))

      await vi.advanceTimersByTimeAsync(worstCase - 1)
      expect(outcome).toBeUndefined()

      await vi.advanceTimersByTimeAsync(1)
      await saving
      expect(outcome).toEqual({ ok: false, error: 'core_unavailable' })
      expect(fetch).toHaveBeenCalledTimes(3)
      expect(notRecorded()[0].fields).toEqual(expect.objectContaining({ kind: 'transport', cause: deadlineMessage }))
    })
  })
})
