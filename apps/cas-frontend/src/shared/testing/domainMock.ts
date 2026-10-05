import { HttpResponse } from 'msw'
import type { Method } from './mockRequest'
import { mockRequest } from './mockRequest'
import type { Spy } from './runtime'

export type Failure<Code extends string> = { error: Code } | { networkError: true }
export type Answer<Payload, Code extends string> = Payload | Failure<Code>
export type Resolver<Args, Payload, Code extends string> = (args: Args) => Answer<Payload, Code> | Promise<Answer<Payload, Code>>
export const isFailure = <Code extends string>(value: unknown): value is Failure<Code> =>
  typeof value === 'object' && value !== null && ('error' in value || 'networkError' in value)

export const failureResponse = <Code extends string>(failure: Failure<Code>, statuses: Record<Code, number>) => {
  if ('networkError' in failure) {
    return HttpResponse.error()
  }
  const code = failure.error
  return HttpResponse.json({ error: { code, message: code } }, { status: statuses[failure.error] })
}
export const successResponse = (value: unknown, status = 200) =>
  value === undefined ? new HttpResponse(null, { status: 204 }) : HttpResponse.json(value as Record<string, unknown>, { status })

export const domainMock = <Args, Input, Payload, Code extends string>(
  method: Method,
  path: string,
  build: (input?: Input) => Payload,
  statuses: Record<Code, number>,
  envelope: (payload: Payload) => unknown = value => value,
  successStatus = 200,
) => {
  const respond = (resolver: Resolver<Args, Payload, Code>) =>
    mockRequest(method, path).respond(async args => {
      const result = await resolver(args as Args)
      return isFailure<Code>(result) ? failureResponse(result, statuses) : successResponse(envelope(result), successStatus)
    }) as Spy<Args>
  return Object.assign((input?: Input) => respond(() => build(input)), {
    respond,
    error: (code: Code) => respond(() => ({ error: code })),
    networkError: () => respond(() => ({ networkError: true })),
  })
}
