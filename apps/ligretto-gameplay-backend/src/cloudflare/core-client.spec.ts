import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGame } from '@memebattle/ligretto-core-client/internal'
import { createCoreClient } from './core-client'
import type { Env } from './env'

describe('createCoreClient', () => {
  const sent: Request[] = []

  const clientWith = (tokens: string) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        sent.push(new Request(input, init))
        return Response.json({ id: 'game-1' }, { status: 201 })
      }),
    )
    return createCoreClient({ LIGRETTO_CORE_URL: 'http://core.test', LIGRETTO_INTERNAL_API_TOKEN: tokens } as Env)
  }

  afterEach(() => {
    sent.length = 0
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends the first of the rotated tokens to the internal API', async () => {
    const result = await createGame({ client: clientWith(' current-token , old-token') })

    expect(result).toMatchObject({ kind: 'success', data: { id: 'game-1' } })
    expect(sent[0]!.url).toBe('http://core.test/internal/games')
    expect(sent[0]!.headers.get('authorization')).toBe('Bearer current-token')
  })

  it('skips an empty value before the token', async () => {
    await createGame({ client: clientWith(',current-token') })

    expect(sent[0]!.headers.get('authorization')).toBe('Bearer current-token')
  })

  it('ends a request ligretto-core does not answer as a transport failure', async () => {
    const deadline = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal)
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_, reject) => init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason))),
      ),
    )
    const pending = createGame({ client: createCoreClient({ LIGRETTO_CORE_URL: 'http://core.test', LIGRETTO_INTERNAL_API_TOKEN: 'token' } as Env) })

    deadline.abort(new DOMException('The deadline passed', 'TimeoutError'))

    expect(await pending).toMatchObject({ kind: 'transport', cause: { name: 'TimeoutError' } })
    expect(AbortSignal.timeout).toHaveBeenCalledWith(3_000)
  })
})
