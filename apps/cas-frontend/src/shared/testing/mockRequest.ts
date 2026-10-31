import { http, HttpResponse } from 'msw'
import { createSpy, registerHandler } from './runtime'

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'
export type ParsedRequest = Record<string, unknown>

/** Internal wire primitive. Entity helpers own paths, envelopes and statuses. */
export const mockRequest = (method: Method, path: string) => {
  const respond = (answer: (args: ParsedRequest) => Response | Promise<Response>) => {
    const spy = createSpy()
    registerHandler(
      http[method.toLowerCase() as Lowercase<Method>](path, async ({ request, params }) => {
        const body = request.body ? await request.json() : {}
        const args = { ...params, ...(body as Record<string, unknown>) }
        spy(args)
        return answer(args)
      }),
    )
    return spy
  }
  return {
    respond,
    json: (body: Record<string, unknown> | unknown[]) => respond(() => HttpResponse.json(body)),
    empty: () => respond(() => new HttpResponse(null, { status: 204 })),
    error: (status: number, code: string) => respond(() => HttpResponse.json({ error: { code, message: code } }, { status })),
    networkError: () => respond(() => HttpResponse.error()),
  }
}
